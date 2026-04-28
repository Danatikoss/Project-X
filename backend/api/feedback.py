"""
Feedback API.
POST /api/feedback  — submit user feedback or template idea
GET  /api/feedback  — list all feedback (admin only)
"""
from datetime import datetime
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from api.deps import get_current_user, get_admin_user

router = APIRouter()


class FeedbackIn(BaseModel):
    message: str
    category: str = "general"  # general | template_idea | bug


class FeedbackOut(BaseModel):
    id: int
    user_id: int
    user_email: str
    category: str
    message: str
    created_at: datetime

    class Config:
        from_attributes = True


@router.post("", status_code=201)
async def submit_feedback(
    body: FeedbackIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from models.feedback import Feedback
    fb = Feedback(user_id=user.id, category=body.category, message=body.message)
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
            created_at=r.created_at,
        )
        for r in rows
    ]
