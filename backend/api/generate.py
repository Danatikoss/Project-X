"""
Template-based slide generation API.

POST /generate/presentation  — full presentation from a prompt
POST /generate/slide         — single slide (returns PPTX)
GET  /generate/templates     — list available templates
"""
import io
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional

from api.deps import get_current_user
from models.user import User
from services.template_generator import generate_presentation_plan, fill_single_slide
from services.template_library import load_catalog, get_template_by_id
from services.template_injector import inject_into_slide, inject_into_presentation
from pptx import Presentation as PptxPresentation

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Request / Response models ─────────────────────────────────────────────────

class GeneratePresentationRequest(BaseModel):
    prompt: str = Field(..., min_length=5, max_length=2000)
    num_slides: int = Field(default=5, ge=1, le=15)


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
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
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


@router.post("/presentation")
async def generate_presentation(
    body: GeneratePresentationRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Generate a full presentation PPTX from a text prompt.
    LLM selects templates and fills all slots automatically.
    """
    try:
        plan = await generate_presentation_plan(
            prompt=body.prompt,
            num_slides=body.num_slides,
        )
    except Exception as e:
        logger.error("Generation failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Ошибка генерации: {e}")

    slides_plan = plan.get("slides", [])
    if not slides_plan:
        raise HTTPException(status_code=502, detail="LLM не вернул слайды")

    # Build PPTX
    from pptx import Presentation as PptxPrs
    from services.template_injector import PPTX_PATH as TPL_PATH
    catalog = load_catalog()

    # Start with a blank presentation matching template dimensions
    source = PptxPrs(str(TPL_PATH))
    out_prs = PptxPrs()
    out_prs.slide_width = source.slide_width
    out_prs.slide_height = source.slide_height
    # Remove default blank slide added by python-pptx
    from pptx.oxml.ns import qn
    sldIdLst = out_prs.slides._sldIdLst
    for sldId in list(sldIdLst):
        sldIdLst.remove(sldId)

    errors = []
    for i, slide_plan in enumerate(slides_plan):
        template_id = slide_plan.get("template_id")
        slots = slide_plan.get("slots", {})

        try:
            tmpl = get_template_by_id(template_id, catalog)
        except ValueError:
            logger.warning("Unknown template_id %r at slide %d, skipping", template_id, i)
            errors.append(f"Слайд {i+1}: неизвестный шаблон {template_id!r}")
            continue

        try:
            inject_into_presentation(out_prs, tmpl, slots)
        except Exception as e:
            logger.error("Inject failed for slide %d: %s", i, e)
            errors.append(f"Слайд {i+1}: ошибка рендера — {e}")

    if len(out_prs.slides) == 0:
        raise HTTPException(status_code=502, detail="Не удалось собрать ни одного слайда")

    title = plan.get("title", "presentation")
    safe_title = "".join(c for c in title if c.isalnum() or c in " _-")[:40].strip() or "presentation"
    filename = f"{safe_title}.pptx"

    buf = _pptx_to_stream(out_prs)
    return _make_streaming_response(buf, filename)


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
