"""
Template Injector — copies a slide from Libraryslides.pptx and injects
content into named slots (shapes whose name starts with 'slot_').

Key design:
- Preserves all visual formatting (font, size, color, fill, position)
- Replaces only the text content of each slot
- Multi-paragraph text is split on \\n
- Returns a new single-slide Presentation object
"""
import copy
import logging
from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.oxml.ns import qn
from pptx.util import Pt

from services.template_library import TemplateInfo, PPTX_PATH

logger = logging.getLogger(__name__)


def _clear_text_frame(tf):
    """Remove all paragraphs except the first, clear all runs in the first."""
    txBody = tf._txBody
    # Keep first paragraph, delete the rest
    paras = txBody.findall(qn("a:p"))
    for p in paras[1:]:
        txBody.remove(p)
    # Clear runs from the first paragraph (keep paragraph-level pPr if present)
    first_para = paras[0]
    for r in first_para.findall(qn("a:r")):
        first_para.remove(r)
    for br in first_para.findall(qn("a:br")):
        first_para.remove(br)


def _copy_run_format(source_run_elem):
    """Deep copy run properties (rPr) from a source run element."""
    rPr = source_run_elem.find(qn("a:rPr"))
    if rPr is not None:
        return copy.deepcopy(rPr)
    return None


def _make_run(text: str, rPr=None) -> etree._Element:
    """Create an <a:r> element with optional formatting."""
    r = etree.SubElement(etree.Element("dummy"), qn("a:r"))
    # Detach from dummy parent
    r = etree.Element(qn("a:r"))
    if rPr is not None:
        r.append(copy.deepcopy(rPr))
    t = etree.SubElement(r, qn("a:t"))
    t.text = text
    return r


def _set_shape_text(shape, new_text: str):
    """
    Replace text in a shape's text frame while preserving formatting.
    new_text may contain \\n for paragraph breaks.
    """
    if not shape.has_text_frame:
        return

    tf = shape.text_frame
    txBody = tf._txBody

    # Grab formatting from the first run of the first paragraph (if any)
    first_para = txBody.find(qn("a:p"))
    rPr = None
    if first_para is not None:
        first_run = first_para.find(qn("a:r"))
        if first_run is not None:
            rPr = _copy_run_format(first_run)

    # Also grab paragraph-level properties from first paragraph
    pPr = None
    if first_para is not None:
        pPr_elem = first_para.find(qn("a:pPr"))
        if pPr_elem is not None:
            pPr = copy.deepcopy(pPr_elem)

    # Split text into lines
    lines = new_text.split("\n")

    # Remove all existing paragraphs
    for p in txBody.findall(qn("a:p")):
        txBody.remove(p)

    # Re-create paragraphs
    for i, line in enumerate(lines):
        p = etree.SubElement(txBody, qn("a:p"))
        if pPr is not None:
            p.append(copy.deepcopy(pPr))
        if line:  # non-empty line
            r = _make_run(line, rPr)
            p.append(r)
        # empty line = paragraph break, no run needed

    logger.debug("Set text on shape %r: %r", shape.name, new_text[:60])


def inject_into_slide(template: TemplateInfo, slots: dict[str, str]) -> Presentation:
    """
    Copy the template slide from Libraryslides.pptx, inject slot content,
    and return a new Presentation containing just that one slide.

    Args:
        template: TemplateInfo from the catalog
        slots: dict mapping slot_name → text content

    Returns:
        A Presentation with a single slide (ready to save or merge)
    """
    source_prs = Presentation(str(PPTX_PATH))
    source_slide = source_prs.slides[template.slide_index]

    # Create a new presentation with the same dimensions
    out_prs = Presentation()
    out_prs.slide_width = source_prs.slide_width
    out_prs.slide_height = source_prs.slide_height

    # Add a blank slide layout
    blank_layout = out_prs.slide_layouts[6]  # blank
    new_slide = out_prs.slides.add_slide(blank_layout)

    # Copy slide XML (spTree = shape tree) and background
    sp_tree = new_slide.shapes._spTree
    source_sp_tree = source_slide.shapes._spTree

    # Copy background (cSld/bg)
    source_cSld = source_slide._element.find(qn("p:cSld"))
    new_cSld = new_slide._element.find(qn("p:cSld"))
    if source_cSld is not None and new_cSld is not None:
        source_bg = source_cSld.find(qn("p:bg"))
        if source_bg is not None:
            existing_bg = new_cSld.find(qn("p:bg"))
            if existing_bg is not None:
                new_cSld.remove(existing_bg)
            new_cSld.insert(0, copy.deepcopy(source_bg))

    # Copy all shapes from source
    for elem in source_sp_tree:
        tag = etree.QName(elem.tag).localname
        if tag in ("sp", "pic", "graphicFrame", "grpSp", "cxnSp"):
            sp_tree.append(copy.deepcopy(elem))

    # Now inject slot content into the new slide's shapes
    for shape in new_slide.shapes:
        slot_name = shape.name
        if slot_name in slots and hasattr(shape, "has_text_frame") and shape.has_text_frame:
            _set_shape_text(shape, slots[slot_name])
        elif slot_name.startswith("slot_") and slot_name not in slots:
            logger.debug("Slot %r not provided, keeping original text", slot_name)

    return out_prs


def inject_into_presentation(base_prs: Presentation, template: TemplateInfo, slots: dict[str, str]):
    """
    Append an injected template slide to an existing Presentation in-place.
    Uses the same copy mechanism as inject_into_slide but appends to base_prs.
    """
    source_prs = Presentation(str(PPTX_PATH))
    source_slide = source_prs.slides[template.slide_index]

    blank_layout = base_prs.slide_layouts[6]
    new_slide = base_prs.slides.add_slide(blank_layout)

    sp_tree = new_slide.shapes._spTree
    source_sp_tree = source_slide.shapes._spTree

    # Copy background
    source_cSld = source_slide._element.find(qn("p:cSld"))
    new_cSld = new_slide._element.find(qn("p:cSld"))
    if source_cSld is not None and new_cSld is not None:
        source_bg = source_cSld.find(qn("p:bg"))
        if source_bg is not None:
            existing_bg = new_cSld.find(qn("p:bg"))
            if existing_bg is not None:
                new_cSld.remove(existing_bg)
            new_cSld.insert(0, copy.deepcopy(source_bg))

    # Copy shapes
    for elem in source_sp_tree:
        tag = etree.QName(elem.tag).localname
        if tag in ("sp", "pic", "graphicFrame", "grpSp", "cxnSp"):
            sp_tree.append(copy.deepcopy(elem))

    # Inject slots
    for shape in new_slide.shapes:
        if shape.name in slots and hasattr(shape, "has_text_frame") and shape.has_text_frame:
            _set_shape_text(shape, slots[shape.name])

    return new_slide
