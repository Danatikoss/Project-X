"""
Library API routes.
POST /api/library/upload
GET  /api/library/slides
GET  /api/library/slides/{id}
PATCH /api/library/slides/{id}
DELETE /api/library/slides/{id}
GET  /api/library/sources
"""
import asyncio
import json
import os
import shutil
import uuid
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from config import settings
from database import get_db
from models.assembly import AssembledPresentation
from models.slide import SourcePresentation, SlideLibraryEntry
from models.user import User
from api.schemas import (
    UploadResponse, SourcePresentationResponse,
    SlideResponse, SlidePatchRequest, SlideListResponse,
)
from api.utils import slide_to_response
from api.deps import get_current_user
from services.indexing import index_presentation

logger = logging.getLogger(__name__)
router = APIRouter()

# Keep strong references to running indexing tasks to prevent GC
_indexing_tasks: set[asyncio.Task] = set()

ALLOWED_TYPES = {"pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                 "pdf": "application/pdf"}


def _owned_source_ids(db: Session, user_id: int):
    """Return a subquery of source IDs belonging to this user."""
    return db.query(SourcePresentation.id).filter(SourcePresentation.owner_id == user_id).subquery()


def _check_slide_owner(slide: SlideLibraryEntry, user_id: int):
    if slide.source.owner_id != user_id:
        raise HTTPException(403, detail="Нет доступа к этому слайду")


@router.post("/upload", response_model=UploadResponse, status_code=202)
async def upload_presentation(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    filename = file.filename or "upload"
    ext = Path(filename).suffix.lower().lstrip(".")
    if ext not in ("pptx", "pdf"):
        raise HTTPException(400, detail="Поддерживаются только файлы PPTX и PDF")

    max_bytes = settings.max_upload_size_mb * 1024 * 1024

    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    unique_name = f"{uuid.uuid4().hex}.{ext}"
    file_path = upload_dir / unique_name

    total = 0
    try:
        with open(file_path, "wb") as f:
            while chunk := await file.read(1024 * 1024):  # 1MB chunks
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(
                        413,
                        detail=f"Файл превышает {settings.max_upload_size_mb} МБ",
                    )
                f.write(chunk)
    except HTTPException:
        file_path.unlink(missing_ok=True)
        raise

    source = SourcePresentation(
        owner_id=user.id,
        filename=filename,
        file_path=str(file_path.resolve()),
        file_type=ext,
        status="pending",
    )
    db.add(source)
    db.commit()
    db.refresh(source)

    ws_token = uuid.uuid4().hex

    task = asyncio.create_task(index_presentation(source.id, ws_token))
    _indexing_tasks.add(task)
    task.add_done_callback(_indexing_tasks.discard)

    return UploadResponse(
        source_id=source.id,
        ws_token=ws_token,
        message=f"Файл {filename} загружен. Индексация запущена.",
    )


@router.get("/slides", response_model=SlideListResponse)
def list_slides(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=24, ge=1, le=100),
    source_id: int | None = Query(default=None),
    layout_type: str | None = Query(default=None),
    language: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    label: str | None = Query(default=None),
    is_outdated: bool | None = Query(default=None),
    project_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    owned = _owned_source_ids(db, user.id)
    query = db.query(SlideLibraryEntry).filter(
        SlideLibraryEntry.source_id.in_(owned),
        SlideLibraryEntry.is_generated == False,  # noqa: E712
    )

    if source_id is not None:
        query = query.filter(SlideLibraryEntry.source_id == source_id)
    if layout_type:
        query = query.filter(SlideLibraryEntry.layout_type == layout_type)
    if language:
        query = query.filter(SlideLibraryEntry.language == language)
    if is_outdated is not None:
        query = query.filter(SlideLibraryEntry.is_outdated == is_outdated)
    if tag:
        query = query.filter(SlideLibraryEntry.tags_json.ilike(f'%"{tag}"%'))
    if label:
        query = query.filter(SlideLibraryEntry.labels_json.ilike(f'%"{label}"%'))
    if project_id is not None:
        query = query.filter(SlideLibraryEntry.project_id == project_id)

    total = query.count()
    slides = query.options(joinedload(SlideLibraryEntry.source)) \
                  .order_by(SlideLibraryEntry.id.desc()) \
                  .offset((page - 1) * page_size).limit(page_size).all()

    # Compute usage counts for the returned slides
    slide_ids_on_page = {s.id for s in slides}
    usage_counts: dict[int, int] = {}
    if slide_ids_on_page:
        rows = db.query(AssembledPresentation.slide_ids_json).filter(
            AssembledPresentation.owner_id == user.id
        ).all()
        for (ids_json,) in rows:
            for sid in json.loads(ids_json or "[]"):
                if sid in slide_ids_on_page:
                    usage_counts[sid] = usage_counts.get(sid, 0) + 1

    return SlideListResponse(
        items=[slide_to_response(s, used_in_assemblies=usage_counts.get(s.id, 0)) for s in slides],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/slides/{slide_id}", response_model=SlideResponse)
def get_slide(slide_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    slide = db.query(SlideLibraryEntry).options(joinedload(SlideLibraryEntry.source)).get(slide_id)
    if not slide:
        raise HTTPException(404, detail="Слайд не найден")
    _check_slide_owner(slide, user.id)
    return slide_to_response(slide, db)


@router.patch("/slides/{slide_id}", response_model=SlideResponse)
def update_slide(slide_id: int, body: SlidePatchRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    slide = db.query(SlideLibraryEntry).options(joinedload(SlideLibraryEntry.source)).get(slide_id)
    if not slide:
        raise HTTPException(404, detail="Слайд не найден")
    _check_slide_owner(slide, user.id)

    if body.title is not None:
        slide.title = body.title
    if body.summary is not None:
        slide.summary = body.summary
    if body.tags is not None:
        slide.tags_json = json.dumps(body.tags, ensure_ascii=False)
    if body.layout_type is not None:
        slide.layout_type = body.layout_type
    if body.labels is not None:
        slide.labels_json = json.dumps(body.labels, ensure_ascii=False)
    if body.is_outdated is not None:
        slide.is_outdated = body.is_outdated
    if body.access_level is not None:
        slide.access_level = body.access_level
    if "project_id" in body.model_fields_set:
        slide.project_id = body.project_id  # None = unassign, int = assign

    db.commit()
    db.refresh(slide)
    return slide_to_response(slide, db)


@router.delete("/slides/{slide_id}", status_code=204)
def delete_slide(slide_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    slide = db.query(SlideLibraryEntry).options(joinedload(SlideLibraryEntry.source)).get(slide_id)
    if not slide:
        raise HTTPException(404, detail="Слайд не найден")
    _check_slide_owner(slide, user.id)
    db.delete(slide)
    db.commit()


from pydantic import BaseModel as _BaseModel

class _SaveGeneratedRequest(_BaseModel):
    slide_ids: list[int]


@router.post("/slides/save-generated", status_code=200)
def save_generated_slides(
    body: _SaveGeneratedRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Mark AI-generated slides as saved to library (is_generated=False)."""
    owned = _owned_source_ids(db, user.id)
    updated = db.query(SlideLibraryEntry).filter(
        SlideLibraryEntry.id.in_(body.slide_ids),
        SlideLibraryEntry.source_id.in_(owned),
        SlideLibraryEntry.is_generated == True,  # noqa: E712
    ).all()
    for slide in updated:
        slide.is_generated = False
    db.commit()
    return {"saved": len(updated)}


@router.get("/labels", response_model=list[str])
def list_labels(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Return all unique user-defined labels across the user's slides."""
    owned = _owned_source_ids(db, user.id)
    rows = db.query(SlideLibraryEntry.labels_json).filter(
        SlideLibraryEntry.source_id.in_(owned),
        SlideLibraryEntry.labels_json != None,
        SlideLibraryEntry.labels_json != "[]",
    ).all()
    labels: set[str] = set()
    for (lj,) in rows:
        try:
            for lbl in json.loads(lj or "[]"):
                if lbl:
                    labels.add(lbl)
        except Exception:
            pass
    return sorted(labels)


@router.get("/sources", response_model=list[SourcePresentationResponse])
def list_sources(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    sources = db.query(SourcePresentation).filter(
        SourcePresentation.owner_id == user.id
    ).order_by(SourcePresentation.id.desc()).all()
    return [SourcePresentationResponse.model_validate(s) for s in sources]


@router.post("/sources/{source_id}/extract-media", status_code=200)
def extract_media_from_source(source_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """
    Re-scan a previously indexed PPTX and extract GIF/video files that were
    missed (e.g. slides indexed before media extraction was implemented).
    Only processes slides that currently have gif_path=None or video_path=None.
    """
    import zipfile
    from services.thumbnail import _detect_media_in_pptx_slide, save_media

    source = db.query(SourcePresentation).get(source_id)
    if not source:
        raise HTTPException(404, detail="Источник не найден")
    if source.owner_id != user.id:
        raise HTTPException(403, detail="Нет доступа")
    if source.file_type != "pptx":
        raise HTTPException(400, detail="Только PPTX поддерживается")
    if not Path(source.file_path).exists():
        raise HTTPException(404, detail="Файл источника не найден на диске")

    slides = db.query(SlideLibraryEntry).filter(
        SlideLibraryEntry.source_id == source_id
    ).all()

    updated = 0
    try:
        from pptx import Presentation as _Prs
        from services.thumbnail import _get_slide_dimensions

        # Build correct slide_index → xml_name map using python-pptx (presentation order)
        prs = _Prs(source.file_path)
        slide_xml_by_idx = {
            i: str(s.part.partname).lstrip("/")
            for i, s in enumerate(prs.slides)
        }

        with zipfile.ZipFile(source.file_path, 'r') as zf:
            slide_cx, slide_cy = _get_slide_dimensions(zf)

            for slide in slides:
                needs_gif = not slide.gif_path
                needs_video = not slide.video_path
                needs_rect = not getattr(slide, 'gif_rect_json', None)
                if not (needs_gif or needs_video or needs_rect):
                    continue

                xml_name = slide_xml_by_idx.get(slide.slide_index)
                if not xml_name or xml_name not in zf.namelist():
                    continue

                _, _, gif_bytes, gif_rect, video_bytes, video_ext = \
                    _detect_media_in_pptx_slide(zf, xml_name, slide_cx, slide_cy)

                changed = False
                if needs_gif and gif_bytes:
                    slide.gif_path = save_media(gif_bytes, source_id, slide.slide_index,
                                                settings.thumbnail_dir, 'gif')
                    changed = True
                if gif_rect and needs_rect:
                    slide.gif_rect_json = json.dumps(gif_rect)
                    changed = True
                if needs_video and video_bytes and video_ext:
                    slide.video_path = save_media(video_bytes, source_id, slide.slide_index,
                                                  settings.thumbnail_dir, video_ext)
                    changed = True
                if changed:
                    updated += 1

        db.commit()
    except Exception as e:
        logger.error(f"extract-media failed for source {source_id}: {e}")
        raise HTTPException(500, detail=str(e))

    return {"updated": updated, "total": len(slides)}


@router.delete("/sources/{source_id}", status_code=204)
def delete_source(source_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    source = db.query(SourcePresentation).get(source_id)
    if not source:
        raise HTTPException(404, detail="Источник не найден")
    if source.owner_id != user.id:
        raise HTTPException(403, detail="Нет доступа")

    # Delete thumbnail directory
    thumb_dir = Path(settings.thumbnail_dir) / str(source_id)
    if thumb_dir.exists():
        shutil.rmtree(thumb_dir)

    # Cascade deletes slides (defined in model)
    db.delete(source)
    db.commit()


# ── Text editing endpoints ────────────────────────────────────────────────────

def _extract_text_elements(pptx_bytes: bytes) -> list[dict]:
    """Use python-pptx to extract positioned text elements from a 1-slide PPTX."""
    import io
    from pptx import Presentation

    try:
        prs = Presentation(io.BytesIO(pptx_bytes))
    except Exception as e:
        logger.warning(f"Cannot open PPTX for text extraction: {e}")
        return []

    if not prs.slides:
        return []

    sl = prs.slides[0]
    slide_w = prs.slide_width or 1
    slide_h = prs.slide_height or 1
    elements = []

    for shape in sl.shapes:
        if not shape.has_text_frame:
            continue
        if shape.left is None or shape.top is None:
            continue

        tf = shape.text_frame
        lines = []
        for para in tf.paragraphs:
            line = "".join(run.text for run in para.runs if run.text)
            if line:
                lines.append(line)
        full_text = "\n".join(lines)
        if not full_text.strip():
            continue

        x_pct = round(shape.left / slide_w * 100, 2)
        y_pct = round(shape.top / slide_h * 100, 2)
        w_pct = round(shape.width / slide_w * 100, 2)
        h_pct = round(shape.height / slide_h * 100, 2)

        font_size = 18
        font_bold = False
        font_color = "#000000"
        font_align = "left"

        try:
            from pptx.enum.text import PP_ALIGN
            for para in tf.paragraphs:
                if not para.runs:
                    continue
                run = para.runs[0]
                if run.font.size:
                    font_size = max(6, int(run.font.size.pt))
                font_bold = bool(run.font.bold)
                try:
                    rgb = run.font.color.rgb
                    font_color = f"#{rgb}"
                except Exception:
                    pass
                if para.alignment == PP_ALIGN.CENTER:
                    font_align = "center"
                elif para.alignment == PP_ALIGN.RIGHT:
                    font_align = "right"
                break
        except Exception:
            pass

        elements.append({
            "id": str(shape.shape_id),
            "name": shape.name,
            "text": full_text,
            "x": x_pct,
            "y": y_pct,
            "w": w_pct,
            "h": h_pct,
            "font_size": font_size,
            "font_bold": font_bold,
            "font_color": font_color,
            "font_align": font_align,
        })

    return elements


def _apply_text_edits(pptx_bytes: bytes, edits: dict) -> bytes:
    """Replace text in specified shapes while preserving run formatting."""
    import io
    from pptx import Presentation

    prs = Presentation(io.BytesIO(pptx_bytes))
    if not prs.slides:
        return pptx_bytes

    sl = prs.slides[0]
    for shape in sl.shapes:
        sid = str(shape.shape_id)
        if sid not in edits or not shape.has_text_frame:
            continue

        new_text = str(edits[sid])
        tf = shape.text_frame

        # Collect all runs across all paragraphs
        all_runs = [run for para in tf.paragraphs for run in para.runs]
        if not all_runs:
            continue

        # Put all new text into the first run, blank out the rest
        all_runs[0].text = new_text
        for run in all_runs[1:]:
            run.text = ""

    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


@router.get("/slides/{slide_id}/text-elements")
def get_text_elements(
    slide_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return positioned text elements for a slide (for the inline text editor)."""
    slide = db.query(SlideLibraryEntry).options(
        joinedload(SlideLibraryEntry.source)
    ).get(slide_id)
    if not slide:
        raise HTTPException(404, detail="Слайд не найден")

    from api.wopi import _build_single_slide_pptx
    pptx_bytes = _build_single_slide_pptx(slide)
    elements = _extract_text_elements(pptx_bytes)

    # Merge already-saved edits into the element texts
    saved_edits: dict = json.loads(slide.text_edits_json or "{}")
    for el in elements:
        if el["id"] in saved_edits:
            el["text"] = saved_edits[el["id"]]

    return {"elements": elements, "has_edits": bool(saved_edits)}


@router.post("/slides/{slide_id}/text-edits")
def save_text_edits(
    slide_id: int,
    body: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Save user text edits for a slide.
    body = {"edits": {"shape_id": "new text", ...}}
    Persists a new single-slide PPTX with the edits applied and regenerates thumbnail.
    """
    import tempfile
    import time
    from datetime import datetime, timezone
    from api.wopi import _build_single_slide_pptx, _edited_pptx_path

    slide = db.query(SlideLibraryEntry).options(
        joinedload(SlideLibraryEntry.source)
    ).get(slide_id)
    if not slide:
        raise HTTPException(404, detail="Слайд не найден")

    edits: dict = body.get("edits", {})
    if not edits:
        return {"ok": True, "edited": 0, "thumb_version": None}

    # Merge with any existing edits
    existing: dict = json.loads(slide.text_edits_json or "{}")
    existing.update(edits)

    # Build PPTX (uses already-edited version if it exists), apply new edits
    pptx_bytes = _build_single_slide_pptx(slide)
    updated_bytes = _apply_text_edits(pptx_bytes, existing)

    # Persist edited PPTX (reusing WOPI infrastructure)
    _edited_pptx_path(slide_id).write_bytes(updated_bytes)

    # Update DB
    slide.text_edits_json = json.dumps(existing)
    slide.updated_at = datetime.now(timezone.utc)
    db.commit()

    # Regenerate thumbnail from the edited PPTX
    thumb_version: int | None = None
    if slide.thumbnail_path:
        thumb_path = Path(settings.thumbnail_dir) / slide.thumbnail_path
        if thumb_path.parent.exists():
            try:
                import fitz
                from services.thumbnail import _pptx_to_pdf_via_libreoffice

                with tempfile.NamedTemporaryFile(suffix=".pptx", delete=False) as f:
                    f.write(updated_bytes)
                    tmp_pptx = f.name

                try:
                    pdf_path = _pptx_to_pdf_via_libreoffice(tmp_pptx)
                    if pdf_path:
                        doc = fitz.open(pdf_path)
                        pix = doc[0].get_pixmap(matrix=fitz.Matrix(3.0, 3.0))
                        pix.save(str(thumb_path))
                        try:
                            os.unlink(pdf_path)
                        except Exception:
                            pass
                    else:
                        # Fallback: direct PyMuPDF render
                        doc = fitz.open(tmp_pptx)
                        if doc.page_count > 0:
                            pix = doc[0].get_pixmap(matrix=fitz.Matrix(3.0, 3.0))
                            pix.save(str(thumb_path))
                finally:
                    try:
                        os.unlink(tmp_pptx)
                    except Exception:
                        pass

                thumb_version = int(time.time())
            except Exception as e:
                logger.warning(f"Thumbnail regen failed for slide {slide_id}: {e}")

    return {"ok": True, "edited": len(existing), "thumb_version": thumb_version}
