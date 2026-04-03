"""
Theses API — standalone talking-points generation.

GET  /api/theses                       — list user's theses sessions
POST /api/theses                       — create session from assembly
GET  /api/theses/:id                   — get session (slides + theses)
DELETE /api/theses/:id                 — delete session
POST /api/theses/:id/analyze           — analyze slides, return clarifying questions
POST /api/theses/:id/generate          — generate theses (with optional context answers)
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.theses import ThesesSession
from models.user import User
from api.deps import get_current_user
from services.theses import (
    create_session, create_session_from_upload, create_session_from_docx,
    analyze_session, generate_session,
    list_sessions, get_session,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateSessionRequest(BaseModel):
    assembly_id: int


class GenerateRequest(BaseModel):
    context: Optional[dict] = None


def _check_owner(session: ThesesSession, user_id: int):
    if session.owner_id != user_id:
        raise HTTPException(403, detail="Нет доступа к этой сессии")


# ── List & Create ─────────────────────────────────────────────────────────────

_ALLOWED_EXTS = {"pptx", "pdf", "docx"}
_MAX_SIZE_MB = 100


@router.post("/upload", status_code=201)
async def upload_file_session(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a theses session from an uploaded PPTX, PDF, or DOCX file."""
    filename = file.filename or "upload"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in _ALLOWED_EXTS:
        raise HTTPException(400, detail="Поддерживаются только PPTX, PDF и DOCX файлы")

    file_bytes = await file.read()
    if len(file_bytes) > _MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(413, detail=f"Файл слишком большой (макс. {_MAX_SIZE_MB} МБ)")

    title = filename.rsplit(".", 1)[0]

    try:
        if ext == "docx":
            session = create_session_from_docx(db, user.id, title, file_bytes)
        else:
            session = create_session_from_upload(db, user.id, title, file_bytes, ext)
    except Exception as e:
        logger.exception(f"File upload session creation failed: {e}")
        raise HTTPException(500, detail=f"Не удалось обработать файл: {e}")

    return get_session(db, session.id)


@router.get("")
def get_sessions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return list_sessions(db, user.id)


@router.post("", status_code=201)
def new_session(
    body: CreateSessionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        session = create_session(db, user.id, body.assembly_id)
    except ValueError as e:
        raise HTTPException(404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(403, detail=str(e))
    return get_session(db, session.id)


# ── Single Session ────────────────────────────────────────────────────────────

@router.get("/{session_id}")
def fetch_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    s = db.query(ThesesSession).get(session_id)
    if not s:
        raise HTTPException(404, detail="Сессия не найдена")
    _check_owner(s, user.id)
    return get_session(db, session_id)


@router.delete("/{session_id}", status_code=204)
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    s = db.query(ThesesSession).get(session_id)
    if not s:
        raise HTTPException(404, detail="Сессия не найдена")
    _check_owner(s, user.id)
    db.delete(s)
    db.commit()


# ── AI Actions ────────────────────────────────────────────────────────────────

@router.post("/{session_id}/analyze")
async def analyze(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    s = db.query(ThesesSession).get(session_id)
    if not s:
        raise HTTPException(404, detail="Сессия не найдена")
    _check_owner(s, user.id)
    try:
        return await analyze_session(db, session_id)
    except Exception as e:
        logger.exception(f"Analyze failed for session {session_id}: {e}")
        raise HTTPException(500, detail=f"Ошибка анализа: {e}")


@router.post("/{session_id}/generate")
async def generate(
    session_id: int,
    body: GenerateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    s = db.query(ThesesSession).get(session_id)
    if not s:
        raise HTTPException(404, detail="Сессия не найдена")
    _check_owner(s, user.id)
    try:
        theses = await generate_session(db, session_id, context=body.context or {})
        return {"theses": theses}
    except Exception as e:
        logger.exception(f"Generate theses failed for session {session_id}: {e}")
        raise HTTPException(500, detail=f"Ошибка генерации тезисов: {e}")
