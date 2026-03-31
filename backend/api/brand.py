"""
Brand template management + slide generation endpoints.

POST /api/brand/templates          — upload brand PPTX template
GET  /api/brand/templates          — list user's templates
DELETE /api/brand/templates/{id}   — delete template
POST /api/brand/generate           — generate a slide from prompt
"""

import json
import logging
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from api.deps import get_current_user
from api.schemas import BrandTemplateResponse, GenerateSlideRequest, GenerateSlideResponse
from api.utils import slide_to_response
from config import settings
from database import get_db
from models.brand import BrandTemplate
from models.user import User
from services.slide_generator import _extract_brand_colors, generate_slide

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Templates ───────────────────────────────────────────────────────────────

@router.post("/templates", response_model=BrandTemplateResponse)
async def upload_template(
    name: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload a PPTX brand template. Extracts brand colors automatically."""
    if not file.filename or not file.filename.lower().endswith(".pptx"):
        raise HTTPException(400, "Only .pptx files are supported")

    template_dir = Path(settings.upload_dir) / "brand_templates"
    template_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4()}.pptx"
    save_path = str(template_dir / filename)

    content = await file.read()
    Path(save_path).write_bytes(content)

    # Extract brand colors
    colors = _extract_brand_colors(save_path)
    colors_dict = {
        "primary":      colors.primary,
        "secondary":    colors.secondary,
        "background":   colors.background,
        "text":         colors.text,
        "text_body":    colors.text_body,
        "text_muted":   colors.text_muted,
        "accent_light": colors.accent_light,
        "divider":      colors.divider,
    }

    # First template is set as default automatically
    is_first = db.query(BrandTemplate).filter(BrandTemplate.owner_id == user.id).count() == 0

    tmpl = BrandTemplate(
        owner_id   = user.id,
        name       = name,
        pptx_path  = save_path,
        colors_json= json.dumps(colors_dict),
        is_default = is_first,
    )
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)
    return _tmpl_to_response(tmpl)


@router.get("/templates", response_model=list[BrandTemplateResponse])
def list_templates(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    templates = (
        db.query(BrandTemplate)
        .filter(BrandTemplate.owner_id == user.id)
        .order_by(BrandTemplate.is_default.desc(), BrandTemplate.created_at.desc())
        .all()
    )
    return [_tmpl_to_response(t) for t in templates]


@router.patch("/templates/{template_id}/default", response_model=BrandTemplateResponse)
def set_default_template(
    template_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tmpl = db.query(BrandTemplate).filter(
        BrandTemplate.id == template_id,
        BrandTemplate.owner_id == user.id,
    ).first()
    if not tmpl:
        raise HTTPException(404, "Template not found")

    # Clear previous default
    db.query(BrandTemplate).filter(BrandTemplate.owner_id == user.id).update({"is_default": False})
    tmpl.is_default = True
    db.commit()
    db.refresh(tmpl)
    return _tmpl_to_response(tmpl)


@router.delete("/templates/{template_id}", status_code=204)
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tmpl = db.query(BrandTemplate).filter(
        BrandTemplate.id == template_id,
        BrandTemplate.owner_id == user.id,
    ).first()
    if not tmpl:
        raise HTTPException(404, "Template not found")

    # Remove file
    if tmpl.pptx_path and os.path.exists(tmpl.pptx_path):
        try:
            os.remove(tmpl.pptx_path)
        except OSError:
            pass

    db.delete(tmpl)
    db.commit()


# ─── Slide generation ─────────────────────────────────────────────────────────

@router.post("/generate", response_model=GenerateSlideResponse)
async def generate_slide_endpoint(
    req: GenerateSlideRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Generate a new brand-compliant slide from a text prompt.
    If template_id is omitted, uses the user's default template (if any).
    The generated slide is saved to the library and returned.
    """
    template_id = req.template_id

    # Auto-pick default template if not specified
    if template_id is None:
        default = db.query(BrandTemplate).filter(
            BrandTemplate.owner_id == user.id,
            BrandTemplate.is_default == True,
        ).first()
        if default:
            template_id = default.id

    try:
        entry = await generate_slide(
            db          = db,
            prompt      = req.prompt,
            template_id = template_id,
            user_id     = user.id,
            context     = req.context or "",
        )
    except Exception as e:
        logger.error(f"Slide generation failed: {e}", exc_info=True)
        raise HTTPException(500, f"Generation failed: {e}")

    return GenerateSlideResponse(slide=slide_to_response(entry, db))


# ─── Helper ──────────────────────────────────────────────────────────────────

def _tmpl_to_response(t: BrandTemplate) -> BrandTemplateResponse:
    colors = json.loads(t.colors_json or "{}")
    return BrandTemplateResponse(
        id         = t.id,
        name       = t.name,
        is_default = t.is_default,
        colors     = colors,
        created_at = t.created_at,
    )
