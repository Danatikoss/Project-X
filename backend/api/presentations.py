"""
Presentations API — AI-powered full deck generation.

POST /api/presentations/plan    — upload file or text → get slide blueprints (plan)
POST /api/presentations/render  — submit plan → download PPTX
"""
import logging
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from api.deps import get_current_user
from services.presentation_planner import plan_presentation, render_presentation, extract_text, plan_and_render

logger = logging.getLogger(__name__)
router = APIRouter()

_ALLOWED_EXTS = {"pptx", "pdf", "docx", "txt"}
_MAX_SIZE_MB  = 50


# ── Plan ──────────────────────────────────────────────────────────────────────

@router.post("/plan")
async def plan_from_file(
    file: Optional[UploadFile] = File(None),
    text_prompt: Optional[str]  = Form(None),
    title: str                  = Form("Презентация"),
    language: str               = Form(""),
    db: Session                 = Depends(get_db),
    user: User                  = Depends(get_current_user),
):
    """
    Analyse uploaded file (or plain text) and return a slide plan as JSON.
    The plan is an array of blueprint objects — one per slide.
    """
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
        content = ""
        if file_bytes and file_ext:
            content = extract_text(file_bytes, file_ext)
            if text_prompt:
                content = f"Дополнительные инструкции: {text_prompt}\n\n{content}"
        else:
            content = text_prompt or ""

        blueprints = await plan_presentation(content, title=title, language_hint=language)
        return {"title": title, "plan": blueprints}

    except Exception as e:
        logger.exception(f"plan_from_file failed: {e}")
        raise HTTPException(500, detail=f"Ошибка планирования: {e}")


# ── Render ─────────────────────────────────────────────────────────────────────

class RenderRequest(BaseModel):
    title: str
    plan: list[dict]
    brand_template_id: Optional[int] = None


@router.post("/render")
async def render_plan(
    body: RenderRequest,
    db: Session  = Depends(get_db),
    user: User   = Depends(get_current_user),
):
    """
    Render a slide plan (array of blueprints) into a PPTX file.
    Returns a JSON with a download URL.
    """
    if not body.plan:
        raise HTTPException(400, detail="План слайдов пустой")

    try:
        pptx_path = await render_presentation(body.plan, body.brand_template_id, db)
    except Exception as e:
        logger.exception(f"render_plan failed: {e}")
        raise HTTPException(500, detail=f"Ошибка рендеринга: {e}")

    # Expose via /exports static mount
    from config import settings
    export_dir = Path(settings.export_dir)
    export_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{body.title[:40].replace(' ', '_')}.pptx"
    export_path = export_dir / filename

    import shutil
    shutil.copy2(pptx_path, str(export_path))

    return {"download_url": f"/exports/{filename}", "filename": filename}
