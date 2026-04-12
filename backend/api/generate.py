"""
Template-based slide generation API.

POST /generate/presentation       — full presentation from a prompt
POST /generate/slide              — single slide (returns PPTX)
GET  /generate/templates          — list available templates
POST /generate/templates/upload   — upload a new PPTX template
DELETE /generate/templates/{id}   — remove a template
"""
import io
import json
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional

from api.deps import get_current_user
from models.user import User
from services.template_generator import generate_presentation_plan, fill_single_slide
from services.template_library import load_catalog, get_template_by_id, CATALOG_PATH, TEMPLATES_DIR
from services.template_injector import inject_into_slide, inject_into_presentation
from pptx import Presentation as PptxPresentation

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Request / Response models ─────────────────────────────────────────────────

class GeneratePlanRequest(BaseModel):
    prompt: str = Field(..., min_length=5, max_length=4000)


class SlideInPlan(BaseModel):
    template_id: str
    slots: dict[str, str]


class PresentationPlan(BaseModel):
    title: str
    slides: list[SlideInPlan]


class GenerateSlideRequest(BaseModel):
    description: str = Field(..., min_length=5, max_length=1000)
    template_id: Optional[str] = None


class TemplateSlotInfo(BaseModel):
    id: str
    name: str
    description: str
    slots: dict[str, str]
    scenario_tags: list[str]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _pptx_to_stream(prs: PptxPresentation) -> io.BytesIO:
    buf = io.BytesIO()
    prs.save(buf)
    buf.seek(0)
    return buf


def _make_streaming_response(buf: io.BytesIO, filename: str) -> StreamingResponse:
    from urllib.parse import quote
    ascii_name = filename.encode("ascii", "ignore").decode("ascii") or "presentation.pptx"
    encoded_name = quote(filename, safe="")
    disposition = f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{encoded_name}"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": disposition},
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/templates", response_model=list[TemplateSlotInfo])
def list_templates(current_user: User = Depends(get_current_user)):
    """Return all available slide templates with their slot schemas."""
    catalog = load_catalog()
    return [
        TemplateSlotInfo(
            id=t.id,
            name=t.name,
            description=t.description,
            slots=t.slots,
            scenario_tags=t.scenario_tags,
        )
        for t in catalog
    ]


@router.post("/plan", response_model=PresentationPlan)
async def create_plan(
    body: GeneratePlanRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Step 1: Ask LLM to create a presentation plan.
    Returns structured plan (template IDs + slots) for preview before rendering.
    """
    try:
        plan = await generate_presentation_plan(prompt=body.prompt)
    except Exception as e:
        logger.error("Plan generation failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Ошибка генерации плана: {e}")

    slides = plan.get("slides", [])
    if not slides:
        raise HTTPException(status_code=502, detail="LLM не вернул слайды")

    return PresentationPlan(
        title=plan.get("title", "Презентация"),
        slides=[SlideInPlan(template_id=s["template_id"], slots=s.get("slots", {})) for s in slides],
    )


@router.post("/download")
async def download_presentation(
    body: PresentationPlan,
    current_user: User = Depends(get_current_user),
):
    """
    Step 2: Render a confirmed plan to PPTX and return as a download.
    Accepts the plan returned by /plan (possibly edited by user).
    """
    from pptx import Presentation as PptxPrs
    from services.template_injector import PPTX_PATH as TPL_PATH
    from pptx.oxml.ns import qn

    catalog = load_catalog()
    source = PptxPrs(str(TPL_PATH))
    out_prs = PptxPrs()
    out_prs.slide_width = source.slide_width
    out_prs.slide_height = source.slide_height
    sldIdLst = out_prs.slides._sldIdLst
    for sldId in list(sldIdLst):
        sldIdLst.remove(sldId)

    source_cache: dict = {}
    for i, slide in enumerate(body.slides):
        try:
            tmpl = get_template_by_id(slide.template_id, catalog)
        except ValueError:
            logger.warning("Unknown template_id %r at slide %d, skipping", slide.template_id, i)
            continue
        try:
            inject_into_presentation(out_prs, tmpl, slide.slots, source_cache=source_cache)
        except Exception as e:
            logger.error("Inject failed for slide %d: %s", i, e)

    if len(out_prs.slides) == 0:
        raise HTTPException(status_code=502, detail="Не удалось собрать ни одного слайда")

    filename = f"{body.title}.pptx"
    buf = _pptx_to_stream(out_prs)
    return _make_streaming_response(buf, filename)


@router.post("/extract-file")
async def extract_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Extract key content from a PDF or DOCX file.
    Returns a clean text summary suitable for use as a generation prompt.
    """
    from services.template_generator import extract_file_content

    filename = file.filename or "document"
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if ext not in ("pdf", "docx", "doc"):
        raise HTTPException(status_code=400, detail="Поддерживаются только PDF и DOCX файлы")

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:  # 20MB limit
        raise HTTPException(status_code=400, detail="Файл слишком большой (максимум 20MB)")

    try:
        summary = await extract_file_content(content, filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("File extraction failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Ошибка обработки файла: {e}")

    return {"summary": summary, "filename": filename}


@router.post("/slide")
async def generate_single_slide(
    body: GenerateSlideRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Generate a single slide PPTX from a description.
    Optionally specify template_id; otherwise LLM picks one.
    """
    try:
        slide_plan = await fill_single_slide(
            slide_description=body.description,
            template_id=body.template_id,
        )
    except Exception as e:
        logger.error("Single slide generation failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Ошибка генерации: {e}")

    template_id = slide_plan.get("template_id")
    slots = slide_plan.get("slots", {})

    try:
        tmpl = get_template_by_id(template_id)
    except ValueError:
        raise HTTPException(status_code=502, detail=f"Неизвестный шаблон: {template_id!r}")

    try:
        prs = inject_into_slide(tmpl, slots)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка рендера: {e}")

    buf = _pptx_to_stream(prs)
    return _make_streaming_response(buf, "slide.pptx")


# ── Template management ───────────────────────────────────────────────────────

def _save_catalog(catalog_data: list[dict]) -> None:
    with open(CATALOG_PATH, "w", encoding="utf-8") as f:
        json.dump(catalog_data, f, ensure_ascii=False, indent=2)


@router.post("/templates/upload", response_model=TemplateSlotInfo)
async def upload_template(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(default=""),
    scenario_tags: str = Form(default=""),  # comma-separated
    slide_index: int = Form(default=0),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a new PPTX slide template.
    The PPTX must have shapes named slot_* for content injection.
    Only admins can upload templates (they are shared across all users).
    """
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Только администратор может загружать шаблоны")

    if not file.filename or not file.filename.lower().endswith(".pptx"):
        raise HTTPException(status_code=400, detail="Файл должен быть в формате .pptx")

    # Save uploaded file
    uploads_dir = TEMPLATES_DIR / "uploads"
    uploads_dir.mkdir(exist_ok=True)
    file_id = uuid.uuid4().hex[:12]
    pptx_filename = f"uploads/{file_id}.pptx"
    pptx_path = TEMPLATES_DIR / pptx_filename

    content = await file.read()
    pptx_path.write_bytes(content)

    # Extract slot names from the specified slide
    try:
        from pptx import Presentation as PptxPrs
        import io as _io
        prs = PptxPrs(_io.BytesIO(content))
        if slide_index >= len(prs.slides):
            pptx_path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail=f"Слайд {slide_index} не существует в файле (всего {len(prs.slides)})")
        slide = prs.slides[slide_index]
        slots = {
            shape.name: f"Слот {shape.name}"
            for shape in slide.shapes
            if shape.name.startswith("slot_") and hasattr(shape, "has_text_frame") and shape.has_text_frame
        }
        if not slots:
            pptx_path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail="В слайде не найдено ни одного слота (shape с именем slot_*). Переименуй shapes в PowerPoint.")
    except HTTPException:
        raise
    except Exception as e:
        pptx_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Не удалось прочитать PPTX: {e}")

    # Build template ID from name
    template_id = "custom_" + "".join(c if c.isalnum() else "_" for c in name.lower())[:30] + "_" + file_id[:6]

    # Parse scenario_tags
    tags = [t.strip() for t in scenario_tags.split(",") if t.strip()]

    new_entry = {
        "id": template_id,
        "slide_index": slide_index,
        "name": name,
        "description": description,
        "scenario_tags": tags,
        "slots": slots,
        "pptx_file": pptx_filename,
    }

    # Append to catalog
    with open(CATALOG_PATH, encoding="utf-8") as f:
        catalog_data = json.load(f)
    catalog_data.append(new_entry)
    _save_catalog(catalog_data)

    logger.info("Uploaded new template %r by user %d", template_id, current_user.id)
    return TemplateSlotInfo(
        id=template_id,
        name=name,
        description=description,
        slots=slots,
        scenario_tags=tags,
    )


@router.delete("/templates/{template_id}", status_code=204)
def delete_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
):
    """Remove a template from the catalog. Built-in templates cannot be deleted."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Только администратор может удалять шаблоны")

    with open(CATALOG_PATH, encoding="utf-8") as f:
        catalog_data = json.load(f)

    entry = next((e for e in catalog_data if e["id"] == template_id), None)
    if not entry:
        raise HTTPException(status_code=404, detail="Шаблон не найден")

    pptx_file = entry.get("pptx_file", "")
    if not pptx_file.startswith("uploads/"):
        raise HTTPException(status_code=400, detail="Встроенные шаблоны нельзя удалить")

    # Remove file
    pptx_path = TEMPLATES_DIR / pptx_file
    pptx_path.unlink(missing_ok=True)

    # Remove from catalog
    catalog_data = [e for e in catalog_data if e["id"] != template_id]
    _save_catalog(catalog_data)

    logger.info("Deleted template %r by user %d", template_id, current_user.id)
    return None
