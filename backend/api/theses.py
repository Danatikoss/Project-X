"""
Theses API routes.

GET  /api/theses/{assembly_id}          — get saved theses (or 404)
POST /api/theses/{assembly_id}/analyze  — analyze slides, return clarifying questions
POST /api/theses/{assembly_id}/generate — generate theses (with optional context answers)
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.assembly import AssembledPresentation
from models.user import User
from api.deps import get_current_user
from services.theses import analyze_slides, generate_theses, get_saved_theses

logger = logging.getLogger(__name__)
router = APIRouter()


class GenerateRequest(BaseModel):
    context: Optional[dict] = None


def _check_owner(assembly: AssembledPresentation, user_id: int):
    if assembly.owner_id != user_id:
        raise HTTPException(403, detail="Нет доступа к этой сборке")


@router.get("/{assembly_id}")
def get_theses(
    assembly_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assembly = db.query(AssembledPresentation).get(assembly_id)
    if not assembly:
        raise HTTPException(404, detail="Сборка не найдена")
    _check_owner(assembly, user.id)

    result = get_saved_theses(db, assembly_id)
    if result is None:
        raise HTTPException(404, detail="Тезисы ещё не сгенерированы")
    return result


@router.post("/{assembly_id}/analyze")
async def analyze(
    assembly_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assembly = db.query(AssembledPresentation).get(assembly_id)
    if not assembly:
        raise HTTPException(404, detail="Сборка не найдена")
    _check_owner(assembly, user.id)

    try:
        result = await analyze_slides(db, assembly_id)
        return result
    except Exception as e:
        logger.exception(f"Analyze failed for assembly {assembly_id}: {e}")
        raise HTTPException(500, detail=f"Ошибка анализа: {e}")


@router.post("/{assembly_id}/generate")
async def generate(
    assembly_id: int,
    body: GenerateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assembly = db.query(AssembledPresentation).get(assembly_id)
    if not assembly:
        raise HTTPException(404, detail="Сборка не найдена")
    _check_owner(assembly, user.id)

    try:
        theses = await generate_theses(db, assembly_id, context=body.context or {})
        return {"theses": theses}
    except Exception as e:
        logger.exception(f"Generate theses failed for assembly {assembly_id}: {e}")
        raise HTTPException(500, detail=f"Ошибка генерации тезисов: {e}")
