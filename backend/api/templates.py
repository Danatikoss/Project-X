"""CRUD API for user-created assembly templates."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from api.deps import get_current_user
from database import get_db
from models.template import AssemblyTemplate
from models.user import User

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class TemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    emoji: str = Field(default="📋", max_length=10)
    description: str = Field(default="", max_length=200)
    slide_count_hint: int = Field(default=8, ge=1, le=50)
    color_hex: str = Field(default="#3b82f6", pattern="^#[0-9a-fA-F]{6}$")
    prompt: str = Field(..., min_length=5)


class TemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    emoji: Optional[str] = Field(None, max_length=10)
    description: Optional[str] = Field(None, max_length=200)
    slide_count_hint: Optional[int] = Field(None, ge=1, le=50)
    color_hex: Optional[str] = Field(None, pattern="^#[0-9a-fA-F]{6}$")
    prompt: Optional[str] = None


class TemplateResponse(BaseModel):
    id: int
    name: str
    emoji: str
    description: str
    slide_count_hint: int
    color_hex: str
    prompt: str
    created_at: datetime

    class Config:
        from_attributes = True


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[TemplateResponse])
def list_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(AssemblyTemplate)
        .filter(AssemblyTemplate.owner_id == current_user.id)
        .order_by(AssemblyTemplate.created_at.desc())
        .all()
    )


@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
def create_template(
    body: TemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = AssemblyTemplate(
        owner_id=current_user.id,
        name=body.name,
        emoji=body.emoji,
        description=body.description,
        slide_count_hint=body.slide_count_hint,
        color_hex=body.color_hex,
        prompt=body.prompt,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.patch("/{template_id}", response_model=TemplateResponse)
def update_template(
    template_id: int,
    body: TemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = db.query(AssemblyTemplate).get(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    if template.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Доступ запрещён")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(template, field, value)

    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = db.query(AssemblyTemplate).get(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    if template.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Доступ запрещён")

    db.delete(template)
    db.commit()
