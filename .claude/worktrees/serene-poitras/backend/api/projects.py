"""
Projects API.
GET    /api/projects
POST   /api/projects
DELETE /api/projects/{id}
PATCH  /api/projects/{id}
POST   /api/projects/{id}/slides/{slide_id}   — assign slide to project
DELETE /api/projects/{id}/slides/{slide_id}   — remove slide from project
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.project import Project
from models.slide import SlideLibraryEntry, SourcePresentation
from models.user import User
from api.schemas import ProjectResponse, ProjectCreateRequest
from api.deps import get_current_user

router = APIRouter()


def _check_project_owner(project: Project, user_id: int):
    if project.owner_id != user_id:
        raise HTTPException(403, detail="Нет доступа к этому проекту")


@router.get("", response_model=list[ProjectResponse])
def list_projects(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    projects = db.query(Project).filter(Project.owner_id == user.id).order_by(Project.name).all()
    result = []
    for p in projects:
        count = db.query(SlideLibraryEntry).filter(SlideLibraryEntry.project_id == p.id).count()
        result.append(ProjectResponse(
            id=p.id,
            name=p.name,
            color=p.color,
            slide_count=count,
            created_at=p.created_at,
        ))
    return result


@router.post("", response_model=ProjectResponse, status_code=201)
def create_project(body: ProjectCreateRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    existing = db.query(Project).filter(Project.owner_id == user.id, Project.name == body.name).first()
    if existing:
        raise HTTPException(409, detail="Проект с таким названием уже существует")
    project = Project(owner_id=user.id, name=body.name, color=body.color)
    db.add(project)
    db.commit()
    db.refresh(project)
    return ProjectResponse(id=project.id, name=project.name, color=project.color,
                           slide_count=0, created_at=project.created_at)


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(project_id: int, body: ProjectCreateRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    project = db.query(Project).get(project_id)
    if not project:
        raise HTTPException(404, detail="Проект не найден")
    _check_project_owner(project, user.id)
    project.name = body.name
    project.color = body.color
    db.commit()
    db.refresh(project)
    count = db.query(SlideLibraryEntry).filter(SlideLibraryEntry.project_id == project_id).count()
    return ProjectResponse(id=project.id, name=project.name, color=project.color,
                           slide_count=count, created_at=project.created_at)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    project = db.query(Project).get(project_id)
    if not project:
        raise HTTPException(404, detail="Проект не найден")
    _check_project_owner(project, user.id)
    # Unlink slides before deleting
    db.query(SlideLibraryEntry).filter(
        SlideLibraryEntry.project_id == project_id
    ).update({"project_id": None})
    db.delete(project)
    db.commit()


@router.post("/{project_id}/slides/{slide_id}", status_code=204)
def assign_slide(project_id: int, slide_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    project = db.query(Project).get(project_id)
    if not project:
        raise HTTPException(404, detail="Проект не найден")
    _check_project_owner(project, user.id)
    slide = db.query(SlideLibraryEntry).get(slide_id)
    if not slide:
        raise HTTPException(404, detail="Слайд не найден")
    # Verify slide belongs to this user
    source = db.query(SourcePresentation).get(slide.source_id)
    if not source or source.owner_id != user.id:
        raise HTTPException(403, detail="Нет доступа к этому слайду")
    slide.project_id = project_id
    db.commit()


@router.delete("/{project_id}/slides/{slide_id}", status_code=204)
def unassign_slide(project_id: int, slide_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    project = db.query(Project).get(project_id)
    if not project:
        raise HTTPException(404, detail="Проект не найден")
    _check_project_owner(project, user.id)
    slide = db.query(SlideLibraryEntry).filter(
        SlideLibraryEntry.id == slide_id,
        SlideLibraryEntry.project_id == project_id,
    ).first()
    if slide:
        slide.project_id = None
        db.commit()
