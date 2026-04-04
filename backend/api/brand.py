"""
Brand template management + slide generation endpoints.

POST /api/brand/templates                      — upload brand PPTX template
GET  /api/brand/templates                      — list user's templates
DELETE /api/brand/templates/{id}               — delete template
PATCH /api/brand/templates/{id}/default        — set as default
PATCH /api/brand/templates/{id}/guidelines     — update strict brand guidelines (admin only)
POST /api/brand/templates/{id}/guidelines/bg   — upload background image (admin only)
DELETE /api/brand/templates/{id}/guidelines/bg — remove background image (admin only)
POST /api/brand/generate                       — generate a slide from prompt
"""

import json
import logging
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session
from typing import Optional

from api.deps import get_current_user, get_admin_user
from api.schemas import BrandTemplateResponse, BrandGuidelinesUpdate, GenerateSlideRequest, GenerateSlideResponse
from api.utils import slide_to_response
from config import settings
from database import get_db
from models.brand import BrandTemplate
from models.user import User
from services.slide_generator import _extract_brand_colors, generate_slide

logger = logging.getLogger(__name__)
router = APIRouter()

_BRAND_BG_DIR = Path(settings.upload_dir) / "brand_backgrounds"


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
        # Guidelines inherit extracted primary color for shape
        shape_color = colors.primary,
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

    if tmpl.pptx_path and os.path.exists(tmpl.pptx_path):
        try:
            os.remove(tmpl.pptx_path)
        except OSError:
            pass

    if tmpl.background_image_path and os.path.exists(tmpl.background_image_path):
        try:
            os.remove(tmpl.background_image_path)
        except OSError:
            pass

    db.delete(tmpl)
    db.commit()


# ─── Brand Guidelines (admin only) ───────────────────────────────────────────

@router.patch("/templates/{template_id}/guidelines", response_model=BrandTemplateResponse)
def update_guidelines(
    template_id: int,
    body: BrandGuidelinesUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_admin_user),
):
    """Update strict brand guidelines for a template (admin only)."""
    tmpl = db.query(BrandTemplate).filter(
        BrandTemplate.id == template_id,
        BrandTemplate.owner_id == user.id,
    ).first()
    if not tmpl:
        raise HTTPException(404, "Template not found")

    if body.font_family is not None:
        tmpl.font_family = body.font_family
    if body.title_font_color is not None:
        tmpl.title_font_color = body.title_font_color.lstrip("#")
    if body.title_font_size is not None:
        tmpl.title_font_size = body.title_font_size
    if body.body_font_color is not None:
        tmpl.body_font_color = body.body_font_color.lstrip("#")
    if body.body_font_size is not None:
        tmpl.body_font_size = body.body_font_size
    if body.shape_color is not None:
        tmpl.shape_color = body.shape_color.lstrip("#")
    if body.shape_opacity is not None:
        tmpl.shape_opacity = max(0, min(100, body.shape_opacity))

    if body.clear_background_image and tmpl.background_image_path:
        if os.path.exists(tmpl.background_image_path):
            try:
                os.remove(tmpl.background_image_path)
            except OSError:
                pass
        tmpl.background_image_path = None

    db.commit()
    db.refresh(tmpl)
    return _tmpl_to_response(tmpl)


@router.post("/templates/{template_id}/guidelines/bg", response_model=BrandTemplateResponse)
async def upload_background_image(
    template_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_admin_user),
):
    """Upload a background image for a brand template (admin only)."""
    tmpl = db.query(BrandTemplate).filter(
        BrandTemplate.id == template_id,
        BrandTemplate.owner_id == user.id,
    ).first()
    if not tmpl:
        raise HTTPException(404, "Template not found")

    if not file.filename:
        raise HTTPException(400, "No file provided")

    ext = Path(file.filename).suffix.lower()
    if ext not in {".png", ".jpg", ".jpeg", ".webp"}:
        raise HTTPException(400, "Only PNG/JPG/WEBP images are supported")

    _BRAND_BG_DIR.mkdir(parents=True, exist_ok=True)

    # Remove old background image if exists
    if tmpl.background_image_path and os.path.exists(tmpl.background_image_path):
        try:
            os.remove(tmpl.background_image_path)
        except OSError:
            pass

    filename = f"{uuid.uuid4()}{ext}"
    save_path = str(_BRAND_BG_DIR / filename)
    content = await file.read()
    Path(save_path).write_bytes(content)

    tmpl.background_image_path = save_path
    db.commit()
    db.refresh(tmpl)
    return _tmpl_to_response(tmpl)


@router.delete("/templates/{template_id}/guidelines/bg", response_model=BrandTemplateResponse)
def remove_background_image(
    template_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_admin_user),
):
    """Remove background image from a brand template (admin only)."""
    tmpl = db.query(BrandTemplate).filter(
        BrandTemplate.id == template_id,
        BrandTemplate.owner_id == user.id,
    ).first()
    if not tmpl:
        raise HTTPException(404, "Template not found")

    if tmpl.background_image_path and os.path.exists(tmpl.background_image_path):
        try:
            os.remove(tmpl.background_image_path)
        except OSError:
            pass
    tmpl.background_image_path = None
    db.commit()
    db.refresh(tmpl)
    return _tmpl_to_response(tmpl)


# ─── Slide generation ─────────────────────────────────────────────────────────

@router.post("/generate", response_model=GenerateSlideResponse)
async def generate_slide_endpoint(
    req: GenerateSlideRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    template_id = req.template_id

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

def _bg_image_url(tmpl: BrandTemplate) -> Optional[str]:
    """Convert filesystem path to a public URL for the background image."""
    if not tmpl.background_image_path:
        return None
    filename = Path(tmpl.background_image_path).name
    return f"/brand-backgrounds/{filename}"


def _tmpl_to_response(t: BrandTemplate) -> BrandTemplateResponse:
    colors = json.loads(t.colors_json or "{}")
    return BrandTemplateResponse(
        id         = t.id,
        name       = t.name,
        is_default = t.is_default,
        colors     = colors,
        created_at = t.created_at,
        background_image_url = _bg_image_url(t),
        font_family      = t.font_family or "Montserrat",
        title_font_color = t.title_font_color or "FFFFFF",
        title_font_size  = t.title_font_size or 30,
        body_font_color  = t.body_font_color or "1E293B",
        body_font_size   = t.body_font_size or 18,
        shape_color      = t.shape_color or "1E3A8A",
        shape_opacity    = t.shape_opacity if t.shape_opacity is not None else 100,
    )
