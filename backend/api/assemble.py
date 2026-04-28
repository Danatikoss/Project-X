"""
Assembly API routes.
POST /api/assemble
GET  /api/assemble
GET  /api/assemble/public/{share_token}
GET  /api/assemble/{id}
PATCH /api/assemble/{id}
POST /api/assemble/{id}/export
POST /api/assemble/{id}/share
POST /api/assemble/{id}/duplicate
DELETE /api/assemble/{id}
"""
import json
import logging
import secrets
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload

from config import settings
from database import get_db
from models.assembly import AssembledPresentation
from models.slide import SlideLibraryEntry
from models.user import User
from api.schemas import (
    AssembleRequest, AssembleBlankRequest, AssemblyPatchRequest,
    AssemblyResponse, AssemblyListItem,
    ExportRequest,
)
from api.utils import slide_to_response
from api.deps import get_current_user
from api.ws import assembly_room
from services.assembly import run_assembly
from services.export import export_to_pptx, export_to_pdf

logger = logging.getLogger(__name__)
router = APIRouter()


def _assembly_to_response(assembly: AssembledPresentation, db: Session) -> AssemblyResponse:
    slide_ids = json.loads(assembly.slide_ids_json or "[]")
    if slide_ids:
        slides_map = {
            s.id: s for s in db.query(SlideLibraryEntry)
            .options(
                joinedload(SlideLibraryEntry.source),
                joinedload(SlideLibraryEntry.project),
            )
            .filter(SlideLibraryEntry.id.in_(slide_ids))
            .all()
        }
        slides_ordered = [slide_to_response(slides_map[sid], db) for sid in slide_ids if sid in slides_map]
    else:
        slides_ordered = []

    return AssemblyResponse(
        id=assembly.id,
        title=assembly.title,
        prompt=assembly.prompt,
        slides=slides_ordered,
        overlays=json.loads(assembly.overlays_json or "{}"),
        status=assembly.status,
        share_token=assembly.share_token,
        edit_token=assembly.edit_token,
        created_at=assembly.created_at,
        updated_at=assembly.updated_at,
    )


def _check_owner(assembly: AssembledPresentation, user_id: int):
    if assembly.owner_id != user_id:
        raise HTTPException(403, detail="Нет доступа к этой сборке")


@router.post("/blank", response_model=AssemblyResponse, status_code=201)
def create_blank_assembly(body: AssembleBlankRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Create an empty assembly for manual slide selection."""
    assembly = AssembledPresentation(
        owner_id=user.id,
        title=body.title,
        prompt="(создано вручную)",
        slide_ids_json="[]",
        status="draft",
    )
    db.add(assembly)
    db.commit()
    db.refresh(assembly)
    return _assembly_to_response(assembly, db)


@router.post("/from-template/{template_id}", response_model=AssemblyResponse, status_code=201)
def create_from_template(
    template_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new assembly pre-populated with slides from a template."""
    from models.template import AssemblyTemplate
    template = db.query(AssemblyTemplate).get(template_id)
    if not template:
        raise HTTPException(404, detail="Шаблон не найден")
    if not user.is_admin and template.owner_id != user.id and not template.is_public:
        raise HTTPException(403, detail="Нет доступа")

    template.uses_count = (template.uses_count or 0) + 1

    assembly = AssembledPresentation(
        owner_id=user.id,
        title=template.name,
        prompt=f"(из шаблона: {template.name})",
        slide_ids_json=template.slide_ids_json,
        overlays_json=template.overlays_json,
        status="draft",
    )
    db.add(assembly)
    db.commit()
    db.refresh(assembly)
    return _assembly_to_response(assembly, db)


@router.post("", response_model=AssemblyResponse, status_code=201)
async def create_assembly(body: AssembleRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    assembly = await run_assembly(db, body.prompt, body.max_slides, user_id=user.id)
    return _assembly_to_response(assembly, db)


@router.get("/public/{share_token}", response_model=AssemblyResponse)
def get_public_assembly(share_token: str, db: Session = Depends(get_db)):
    """Return a shared assembly by its share token — no auth required."""
    assembly = db.query(AssembledPresentation).filter_by(share_token=share_token).first()
    if not assembly:
        raise HTTPException(404, detail="Сборка не найдена или ссылка устарела")
    return _assembly_to_response(assembly, db)


@router.get("", response_model=list[AssemblyListItem])
def list_assemblies(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    assemblies = db.query(AssembledPresentation).filter(
        AssembledPresentation.owner_id == user.id
    ).order_by(AssembledPresentation.id.desc()).limit(50).all()

    result = []
    for a in assemblies:
        slide_ids = json.loads(a.slide_ids_json or "[]")

        thumbnail_urls: list[str] = []
        first_ids = slide_ids[:3]
        if first_ids:
            rows = db.query(SlideLibraryEntry.id, SlideLibraryEntry.thumbnail_path).filter(
                SlideLibraryEntry.id.in_(first_ids)
            ).all()
            thumb_map = {r.id: r.thumbnail_path for r in rows}
            thumbnail_urls = [
                f"/thumbnails/{thumb_map[sid]}"
                for sid in first_ids
                if sid in thumb_map and thumb_map[sid]
            ]

        result.append(AssemblyListItem(
            id=a.id,
            title=a.title,
            prompt=a.prompt,
            slide_count=len(slide_ids),
            status=a.status,
            created_at=a.created_at,
            thumbnail_urls=thumbnail_urls,
        ))
    return result


@router.get("/{assembly_id}", response_model=AssemblyResponse)
def get_assembly(assembly_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    assembly = db.query(AssembledPresentation).get(assembly_id)
    if not assembly:
        raise HTTPException(404, detail="Сборка не найдена")
    _check_owner(assembly, user.id)
    return _assembly_to_response(assembly, db)


@router.patch("/{assembly_id}", response_model=AssemblyResponse)
async def update_assembly(assembly_id: int, body: AssemblyPatchRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    assembly = db.query(AssembledPresentation).get(assembly_id)
    if not assembly:
        raise HTTPException(404, detail="Сборка не найдена")
    _check_owner(assembly, user.id)

    if body.slide_ids is not None:
        assembly.slide_ids_json = json.dumps(body.slide_ids)
    if body.title is not None:
        assembly.title = body.title[:200]
    if body.overlays is not None:
        assembly.overlays_json = json.dumps(body.overlays)

    db.commit()
    db.refresh(assembly)
    response = _assembly_to_response(assembly, db)
    await assembly_room.broadcast(assembly_id, {
        "type": "assembly_updated",
        "data": response.model_dump(mode="json"),
    })
    return response


@router.post("/{assembly_id}/export")
def export_assembly(
    assembly_id: int,
    body: ExportRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assembly = db.query(AssembledPresentation).get(assembly_id)
    if not assembly:
        raise HTTPException(404, detail="Сборка не найдена")
    _check_owner(assembly, user.id)

    try:
        if body.format == "pptx":
            file_path = export_to_pptx(db, assembly_id)
            media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            ext = "pptx"
        else:
            file_path = export_to_pdf(db, assembly_id)
            media_type = "application/pdf"
            ext = "pdf"
    except Exception as e:
        logger.exception(f"Export failed for assembly {assembly_id}: {e}")
        raise HTTPException(500, detail=f"Ошибка экспорта: {e}")

    safe_title = "".join(c for c in assembly.title if c.isalnum() or c in " _-")[:40]
    filename = f"{safe_title or 'presentation'}_{assembly_id}.{ext}"

    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=filename,
    )


@router.delete("/{assembly_id}", status_code=204)
def delete_assembly(assembly_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    assembly = db.query(AssembledPresentation).get(assembly_id)
    if not assembly:
        raise HTTPException(404, detail="Сборка не найдена")
    _check_owner(assembly, user.id)
    # Clean up exported file if it exists
    if assembly.export_path and Path(assembly.export_path).exists():
        try:
            Path(assembly.export_path).unlink()
        except Exception:
            pass
    db.delete(assembly)
    db.commit()


@router.post("/{assembly_id}/share")
def share_assembly(assembly_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Generate (or return existing) view-only share token."""
    assembly = db.query(AssembledPresentation).get(assembly_id)
    if not assembly:
        raise HTTPException(404, detail="Сборка не найдена")
    _check_owner(assembly, user.id)

    if not assembly.share_token:
        assembly.share_token = secrets.token_urlsafe(16)
        db.commit()
        db.refresh(assembly)

    return {"share_token": assembly.share_token}


@router.post("/{assembly_id}/share-edit")
def share_assembly_edit(assembly_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Generate (or return existing) collaborative edit token."""
    assembly = db.query(AssembledPresentation).get(assembly_id)
    if not assembly:
        raise HTTPException(404, detail="Сборка не найдена")
    _check_owner(assembly, user.id)

    if not assembly.edit_token:
        assembly.edit_token = secrets.token_urlsafe(20)
        db.commit()
        db.refresh(assembly)

    return {"edit_token": assembly.edit_token}


@router.get("/edit/{edit_token}", response_model=AssemblyResponse)
def get_collab_assembly(edit_token: str, db: Session = Depends(get_db)):
    """Return assembly by edit token — no auth required (token is the credential)."""
    assembly = db.query(AssembledPresentation).filter_by(edit_token=edit_token).first()
    if not assembly:
        raise HTTPException(404, detail="Ссылка недействительна или была отозвана")
    return _assembly_to_response(assembly, db)


@router.patch("/edit/{edit_token}", response_model=AssemblyResponse)
async def update_collab_assembly(edit_token: str, body: AssemblyPatchRequest, db: Session = Depends(get_db)):
    """Update assembly via edit token — no auth required."""
    assembly = db.query(AssembledPresentation).filter_by(edit_token=edit_token).first()
    if not assembly:
        raise HTTPException(404, detail="Ссылка недействительна или была отозвана")

    if body.slide_ids is not None:
        assembly.slide_ids_json = json.dumps(body.slide_ids)
    if body.title is not None:
        assembly.title = body.title[:200]
    if body.overlays is not None:
        assembly.overlays_json = json.dumps(body.overlays)

    db.commit()
    db.refresh(assembly)
    response = _assembly_to_response(assembly, db)
    await assembly_room.broadcast(assembly.id, {
        "type": "assembly_updated",
        "data": response.model_dump(mode="json"),
    })
    return response


@router.post("/{assembly_id}/duplicate", response_model=AssemblyResponse, status_code=201)
def duplicate_assembly(assembly_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    original = db.query(AssembledPresentation).get(assembly_id)
    if not original:
        raise HTTPException(404, detail="Сборка не найдена")
    _check_owner(original, user.id)

    copy = AssembledPresentation(
        owner_id=user.id,
        title=f"{original.title} (копия)",
        prompt=original.prompt,
        slide_ids_json=original.slide_ids_json,
        overlays_json=original.overlays_json,
        status="draft",
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    return _assembly_to_response(copy, db)
