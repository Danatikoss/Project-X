"""CRUD API for user-created assembly templates (slide-based, no AI prompt)."""
import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from api.deps import get_admin_user, get_current_user
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
    slides_preview: list[SlidePreview]
    is_public: bool
    owner_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


def _template_to_response(template: AssemblyTemplate, db: Session) -> TemplateResponse:
    slide_ids = json.loads(template.slide_ids_json or "[]")
    overlays = json.loads(template.overlays_json or "{}")

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

    owner_name = None
    if template.owner:
        owner_name = template.owner.name or template.owner.email

    return TemplateResponse(
        id=template.id,
        name=template.name,
        description=template.description,
        slide_ids=slide_ids,
        overlays=overlays,
        slides_preview=slides_preview,
        is_public=bool(template.is_public),
        owner_name=owner_name,
        created_at=template.created_at,
    )


# ── List: own + public for users; all for admin ────────────────────────────────

@router.get("", response_model=list[TemplateResponse])
def list_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(AssemblyTemplate)
    if current_user.is_admin:
        pass  # admin sees everything
    else:
        q = q.filter(
            or_(
                AssemblyTemplate.owner_id == current_user.id,
                AssemblyTemplate.is_public == True,  # noqa: E712
            )
        )
    templates = q.order_by(AssemblyTemplate.created_at.desc()).all()
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
    if not current_user.is_admin and template.owner_id != current_user.id and not template.is_public:
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
        is_public=False,
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
    if template.owner_id != current_user.id and not current_user.is_admin:
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
    if template.owner_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    db.delete(template)
    db.commit()


# ── Slides for a template (bypasses owner filter so editors load correctly) ────

@router.get("/{template_id}/slides")
def get_template_slides(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return full slide data for all slides in a template.
    Access: owner, admin, or any user if template is public.
    Bypasses per-user library filter so the editor loads correctly.
    """
    template = db.query(AssemblyTemplate).get(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    if not current_user.is_admin and template.owner_id != current_user.id and not template.is_public:
        raise HTTPException(status_code=403, detail="Доступ запрещён")

    slide_ids = json.loads(template.slide_ids_json or "[]")
    if not slide_ids:
        return []

    slides_map = {
        s.id: s for s in db.query(SlideLibraryEntry)
        .options(joinedload(SlideLibraryEntry.source))
        .filter(SlideLibraryEntry.id.in_(slide_ids))
        .all()
    }
    # Preserve order from template
    return [slide_to_response(slides_map[sid]) for sid in slide_ids if sid in slides_map]


# ── Admin: toggle visibility ───────────────────────────────────────────────────

class VisibilityPatch(BaseModel):
    is_public: bool


@router.patch("/{template_id}/visibility", response_model=TemplateResponse)
def set_template_visibility(
    template_id: int,
    body: VisibilityPatch,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    template = db.query(AssemblyTemplate).get(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    template.is_public = body.is_public
    db.commit()
    db.refresh(template)
    return _template_to_response(template, db)
