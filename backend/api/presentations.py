"""
Presentations API — AI-powered full deck generation.

POST /api/presentations/plan    — upload file or text → get slide blueprints (plan)
POST /api/presentations/render  — submit plan → save to library + create assembly
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from api.deps import get_current_user
from services.presentation_planner import plan_presentation, create_assembly_from_plan, extract_text

logger = logging.getLogger(__name__)
router = APIRouter()

_ALLOWED_EXTS = {"pptx", "pdf", "docx", "txt"}
_MAX_SIZE_MB  = 50


# ── Plan ──────────────────────────────────────────────────────────────────────

@router.post("/plan")
async def plan_from_file(
    file: Optional[UploadFile]  = File(None),
    text_prompt: Optional[str]  = Form(None),
    title: str                  = Form("Презентация"),
    language: str               = Form(""),
    brand_template_id: Optional[int] = Form(None),
    db: Session                 = Depends(get_db),
    user: User                  = Depends(get_current_user),
):
    """Analyse uploaded file (or plain text) and return a slide plan as JSON."""
    file_bytes: bytes | None = None
    file_ext:   str   | None = None

    if file and file.filename:
        ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "").lower()
        if ext not in _ALLOWED_EXTS:
            raise HTTPException(400, detail="Поддерживаются PPTX, PDF, DOCX, TXT")
        raw = await file.read()
        if len(raw) > _MAX_SIZE_MB * 1024 * 1024:
            raise HTTPException(413, detail=f"Файл слишком большой (макс. {_MAX_SIZE_MB} МБ)")
        file_bytes = raw
        file_ext   = ext

    if not file_bytes and not text_prompt:
        raise HTTPException(400, detail="Загрузите файл или введите текст")

    try:
        if file_bytes and file_ext:
            content = extract_text(file_bytes, file_ext)
            if text_prompt:
                content = f"Дополнительные инструкции: {text_prompt}\n\n{content}"
        else:
            content = text_prompt or ""

        # Resolve template pptx path for layout filtering
        template_pptx_path: Optional[str] = None
        effective_brand_id = brand_template_id
        if not effective_brand_id:
            from models.brand import BrandTemplate as _BT
            default_tmpl = db.query(_BT).filter(
                _BT.is_default == True,
                _BT.owner_id == user.id,
            ).first()
            if default_tmpl:
                effective_brand_id = default_tmpl.id
        if effective_brand_id:
            import os as _os
            from models.brand import BrandTemplate as _BT
            tmpl = db.query(_BT).filter(_BT.id == effective_brand_id).first()
            if tmpl and tmpl.pptx_path and _os.path.exists(tmpl.pptx_path):
                template_pptx_path = tmpl.pptx_path

        blueprints = await plan_presentation(content, title=title, language_hint=language,
                                             template_pptx_path=template_pptx_path)
        return {"title": title, "plan": blueprints}

    except ValueError as e:
        raise HTTPException(422, detail=str(e))
    except Exception as e:
        logger.exception(f"plan_from_file failed: {e}")
        raise HTTPException(500, detail=f"Ошибка планирования: {e}")


# ── Render → Assembly ──────────────────────────────────────────────────────────

class RenderRequest(BaseModel):
    title: str
    plan: list[dict]
    brand_template_id: Optional[int] = None


@router.post("/render")
async def render_plan(
    body: RenderRequest,
    db: Session = Depends(get_db),
    user: User  = Depends(get_current_user),
):
    """
    Render each blueprint → SlideLibraryEntry with thumbnail → AssembledPresentation.
    Returns {assembly_id} so the frontend can redirect to /assemble/:id.
    """
    if not body.plan:
        raise HTTPException(400, detail="План слайдов пустой")

    try:
        assembly_id, slide_ids = await create_assembly_from_plan(
            blueprints=body.plan,
            title=body.title,
            brand_template_id=body.brand_template_id,
            user_id=user.id,
            db=db,
        )
    except Exception as e:
        logger.exception(f"render_plan failed: {e}")
        raise HTTPException(500, detail=f"Ошибка рендеринга: {e}")

    return {"assembly_id": assembly_id, "slide_ids": slide_ids}
