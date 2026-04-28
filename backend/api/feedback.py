"""
Feedback API.
POST /api/feedback  — submit user feedback or template idea (multipart: message, category, page_url, attachment?)
GET  /api/feedback  — list all feedback (admin only)
"""
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models.user import User
from api.deps import get_current_user, get_admin_user

router = APIRouter()

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024  # 10 MB

_ATTACH_DIR = Path(settings.upload_dir) / "feedback_attachments"


def _attachment_url(filename: str) -> str:
    return f"/feedback-attachments/{filename}"


class FeedbackOut(BaseModel):
    id: int
    user_id: int
    user_email: str
    category: str
    message: str
    page_url: Optional[str]
    attachment_url: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


@router.post("", status_code=201)
async def submit_feedback(
    message: str = Form(...),
    category: str = Form("general"),
    page_url: Optional[str] = Form(None),
    attachment: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from models.feedback import Feedback

    attachment_path: Optional[str] = None

    if attachment and attachment.filename:
        content_type = attachment.content_type or ""
        if content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(400, detail="Разрешены только изображения (PNG, JPEG, GIF, WebP)")

        _ATTACH_DIR.mkdir(parents=True, exist_ok=True)
        ext = Path(attachment.filename).suffix.lower() or ".png"
        filename = f"{uuid.uuid4().hex}{ext}"
        dest = _ATTACH_DIR / filename

        total = 0
        with open(dest, "wb") as f:
            while chunk := await attachment.read(256 * 1024):
                total += len(chunk)
                if total > MAX_ATTACHMENT_BYTES:
                    dest.unlink(missing_ok=True)
                    raise HTTPException(413, detail="Файл превышает 10 МБ")
                f.write(chunk)

        attachment_path = filename

    fb = Feedback(
        user_id=user.id,
        category=category,
        message=message,
        page_url=page_url,
        attachment_path=attachment_path,
    )
    db.add(fb)
    db.commit()
    return {"ok": True}


@router.get("", response_model=list[FeedbackOut])
async def list_feedback(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    from models.feedback import Feedback
    rows = db.query(Feedback).order_by(Feedback.created_at.desc()).all()
    return [
        FeedbackOut(
            id=r.id,
            user_id=r.user_id,
            user_email=r.user.email if r.user else "—",
            category=r.category,
            message=r.message,
            page_url=r.page_url,
            attachment_url=_attachment_url(r.attachment_path) if r.attachment_path else None,
            created_at=r.created_at,
        )
        for r in rows
    ]
