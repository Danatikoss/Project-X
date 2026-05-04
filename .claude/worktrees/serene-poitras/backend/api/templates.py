"""CRUD API for user-created assembly templates (slide-based, no AI prompt)."""
import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from api.deps import get_current_user
from database import get_db
from models.template import AssemblyTemplate
from models.slide import SlideLibraryEntry
from models.user import User
from api.utils import slide_to_response

router = APIRouter()


class TemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(default="", max_length=200)
    slide_ids: list[int] = Field(default_factory=list)
    overlays: dict = Field(default_factory=dict)


class TemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=200)
    slide_ids: Optional[list[int]] = None
    overlays: Optional[dict] = None


class SlidePreview(BaseModel):
    id: int
    thumbnail_url: str
    title: Optional[str] = None


class TemplateResponse(BaseModel):
    id: int
    name: str
    description: str
    slide_ids: list[int]
    overlays: dict
    slides_preview: list[SlidePreview]  # first 4 slides thumbnails
    created_at: datetime

    class Config:
        from_attributes = True


def _template_to_response(template: AssemblyTemplate, db: Session) -> TemplateResponse:
    slide_ids = json.loads(template.slide_ids_json or "[]")
    overlays = json.loads(template.overlays_json or "{}")

    # Load first 4 slides for preview
    preview_ids = slide_ids[:4]
    if preview_ids:
        slides_map = {
            s.id: s for s in db.query(SlideLibraryEntry)
            .options(joinedload(SlideLibraryEntry.source))
            .filter(SlideLibraryEntry.id.in_(preview_ids))
            .all()
        }
        slides_preview = [
            SlidePreview(
                id=sid,
                thumbnail_url=slide_to_response(slides_map[sid]).thumbnail_url,
                title=slides_map[sid].title,
            )
            for sid in preview_ids if sid in slides_map
        ]
    else:
        slides_preview = []

    return TemplateResponse(
        id=template.id,
        name=template.name,
        description=template.description,
        slide_ids=slide_ids,
        overlays=overlays,
        slides_preview=slides_preview,
        created_at=template.created_at,
    )


@router.get("", response_model=list[TemplateResponse])
def list_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    templates = (
        db.query(AssemblyTemplate)
        .filter(AssemblyTemplate.owner_id == current_user.id)
        .order_by(AssemblyTemplate.created_at.desc())
        .all()
    )
    return [_template_to_response(t, db) for t in templates]


@router.get("/{template_id}", response_model=TemplateResponse)
def get_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = db.query(AssemblyTemplate).get(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    if template.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    return _template_to_response(template, db)


@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
def create_template(
    body: TemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = AssemblyTemplate(
        owner_id=current_user.id,
        name=body.name,
        description=body.description,
        slide_ids_json=json.dumps(body.slide_ids),
        overlays_json=json.dumps(body.overlays),
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return _template_to_response(template, db)


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

    if body.name is not None:
        template.name = body.name
    if body.description is not None:
        template.description = body.description
    if body.slide_ids is not None:
        template.slide_ids_json = json.dumps(body.slide_ids)
    if body.overlays is not None:
        template.overlays_json = json.dumps(body.overlays)

    db.commit()
    db.refresh(template)
    return _template_to_response(template, db)


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
