"""
PPTX and PDF export service.

Strategy (Variant C): full slide cloning via python-pptx OPC layer.
For each PPTX-sourced slide:
  1. Open the original PPTX as a Presentation
  2. Deep-copy the slide's spTree (shapes)
  3. Copy ALL related parts (images, video, GIF, audio, charts...)
     using Part(partname, content_type, package, blob) — pptx 1.0 API
  4. Remap rId references in slide XML
For PDF-sourced slides: embed thumbnail as full-page image.
"""
import copy
import io
import json
import logging
import uuid
from pathlib import Path, PurePosixPath

from sqlalchemy.orm import Session

from config import settings
from models.assembly import AssembledPresentation
from models.slide import SlideLibraryEntry, SourcePresentation

logger = logging.getLogger(__name__)

_SKIP_RELTYPES = {
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout",
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide",
}


def _clone_slide(dest_prs, src_pptx_path: str, slide_index: int) -> bool:
    """
    Clone slide[slide_index] from src_pptx_path into dest_prs.
    Copies shapes + ALL dependent parts (images, video, GIF, audio, charts).
    Returns True on success, False on failure.
    """
    from pptx import Presentation as Prs
    from pptx.opc.package import Part
    from pptx.opc.packuri import PackURI
    import lxml.etree as etree

    try:
        src_prs = Prs(src_pptx_path)
    except Exception as e:
        logger.warning(f"Cannot open source PPTX {src_pptx_path}: {e}")
        return False

    if slide_index >= len(src_prs.slides):
        logger.warning(f"Slide index {slide_index} out of range in {src_pptx_path}")
        return False

    src_slide = src_prs.slides[slide_index]
    pkg = dest_prs.part.package  # correct way in pptx 1.0

    # ── 1. Add blank slide ────────────────────────────────────────────────────
    blank_layout = dest_prs.slide_layouts[6]
    dest_slide = dest_prs.slides.add_slide(blank_layout)

    # ── 2. Copy shapes tree verbatim ──────────────────────────────────────────
    src_sp_tree = copy.deepcopy(src_slide.shapes._spTree)
    dest_slide.shapes._spTree.clear()
    for child in src_sp_tree:
        dest_slide.shapes._spTree.append(child)

    # ── 3. Copy background if explicitly set ──────────────────────────────────
    try:
        pml = "http://schemas.openxmlformats.org/presentationml/2006/main"
        src_cSld = src_slide._element.find(f"{{{pml}}}cSld")
        dest_cSld = dest_slide._element.find(f"{{{pml}}}cSld")
        if src_cSld is not None and dest_cSld is not None:
            src_bg = src_cSld.find(f"{{{pml}}}bg")
            if src_bg is not None:
                existing_bg = dest_cSld.find(f"{{{pml}}}bg")
                if existing_bg is not None:
                    dest_cSld.remove(existing_bg)
                dest_cSld.insert(0, copy.deepcopy(src_bg))
    except Exception as e:
        logger.debug(f"Background copy skipped: {e}")

    # ── 4. Copy all dependent parts, build rId mapping ────────────────────────
    rId_map: dict[str, str] = {}

    for old_rId, rel in list(src_slide.part.rels.items()):
        if rel.reltype in _SKIP_RELTYPES:
            continue
        try:
            if rel.is_external:
                new_rId = dest_slide.part.relate_to(
                    rel.target_ref, rel.reltype, is_external=True
                )
            else:
                src_part = rel.target_part
                ext = PurePosixPath(str(src_part.partname)).suffix
                uid = uuid.uuid4().hex[:10]
                new_partname = PackURI(f"/ppt/media/cloned_{uid}{ext}")
                # pptx 1.0: Part(partname, content_type, package, blob)
                new_part = Part(
                    new_partname, src_part.content_type, pkg, src_part.blob
                )
                new_rId = dest_slide.part.relate_to(new_part, rel.reltype)
            rId_map[old_rId] = new_rId
        except Exception as e:
            logger.debug(f"Skipping rel {old_rId} ({rel.reltype}): {e}")

    # ── 5. Remap rId references in the copied XML (in-place) ──────────────────
    if rId_map:
        xml_str = etree.tostring(dest_slide._element, encoding="unicode")
        for old_id, new_id in rId_map.items():
            xml_str = xml_str.replace(f'="{old_id}"', f'="{new_id}"')
        new_el = etree.fromstring(xml_str)
        # _element is the root — replace children and attrs in-place
        dest_slide._element[:] = new_el[:]
        for attr in new_el.attrib:
            dest_slide._element.set(attr, new_el.get(attr))

    return True


def _add_thumbnail_slide(dest_prs, slide_entry: SlideLibraryEntry):
    """Add a full-page thumbnail image as a slide (fallback for PDF-sourced slides)."""
    from pptx.util import Inches

    blank_layout = dest_prs.slide_layouts[6]
    new_slide = dest_prs.slides.add_slide(blank_layout)
    thumb_path = Path(settings.thumbnail_dir) / (slide_entry.thumbnail_path or "")
    if thumb_path.exists():
        new_slide.shapes.add_picture(
            io.BytesIO(thumb_path.read_bytes()),
            Inches(0), Inches(0),
            dest_prs.slide_width, dest_prs.slide_height,
        )


def export_to_pptx(db: Session, assembly_id: int) -> str:
    """Export assembly as PPTX. Returns path to exported file."""
    from pptx import Presentation
    from pptx.util import Inches

    assembly = db.query(AssembledPresentation).get(assembly_id)
    if not assembly:
        raise ValueError(f"Assembly {assembly_id} not found")

    slide_ids: list[int] = json.loads(assembly.slide_ids_json or "[]")
    if not slide_ids:
        raise ValueError("Презентация не содержит слайдов")

    slides = [s for sid in slide_ids if (s := db.query(SlideLibraryEntry).get(sid))]

    export_dir = Path(settings.export_dir)
    export_dir.mkdir(parents=True, exist_ok=True)
    export_path = export_dir / f"{assembly_id}_{uuid.uuid4().hex[:8]}.pptx"

    # Fresh blank presentation — each slide brings its own look
    dest_prs = Presentation()
    dest_prs.slide_width = Inches(13.33)
    dest_prs.slide_height = Inches(7.5)

    for slide_entry in slides:
        if slide_entry.xml_blob:
            src = db.query(SourcePresentation).get(slide_entry.source_id)
            if src and Path(src.file_path).exists():
                ok = _clone_slide(dest_prs, src.file_path, slide_entry.slide_index)
                if ok:
                    continue
            logger.warning(f"Slide {slide_entry.id}: source unavailable, using thumbnail")
        _add_thumbnail_slide(dest_prs, slide_entry)

    dest_prs.save(str(export_path))

    assembly.export_path = str(export_path)
    assembly.status = "exported"
    db.commit()

    return str(export_path)


def export_to_pdf(db: Session, assembly_id: int) -> str:
    """Export assembly as PDF using slide thumbnails. Returns path to exported file."""
    import fitz

    assembly = db.query(AssembledPresentation).get(assembly_id)
    if not assembly:
        raise ValueError(f"Assembly {assembly_id} not found")

    slide_ids: list[int] = json.loads(assembly.slide_ids_json or "[]")
    slides = [s for sid in slide_ids if (s := db.query(SlideLibraryEntry).get(sid))]

    export_dir = Path(settings.export_dir)
    export_dir.mkdir(parents=True, exist_ok=True)
    export_path = export_dir / f"{assembly_id}_{uuid.uuid4().hex[:8]}.pdf"

    doc = fitz.open()
    for slide in slides:
        thumb_path = Path(settings.thumbnail_dir) / (slide.thumbnail_path or "")
        if thumb_path.exists():
            img_doc = fitz.open(str(thumb_path))
            img_pdf = fitz.open("pdf", img_doc.convert_to_pdf())
            img_doc.close()
            doc.insert_pdf(img_pdf)
            img_pdf.close()
        else:
            doc.new_page(width=1920, height=1080)
    doc.save(str(export_path))
    doc.close()

    return str(export_path)
