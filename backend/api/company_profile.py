"""
Company Profile API — admin-controlled org context for AI generation.
GET  /api/org-profile   — any authenticated user
PUT  /api/org-profile   — admin only
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import get_current_user, get_admin_user
from database import get_db
from models.company_profile import CompanyProfile
from models.user import User

router = APIRouter()


class OrgProfileResponse(BaseModel):
    org_name: str | None = None
    org_name_short: str | None = None
    leader_name: str | None = None
    mission: str | None = None
    key_products: str | None = None
    key_stats: str | None = None
    strategic_priorities: str | None = None
    writing_rules: str | None = None
    forbidden_words: str | None = None
    language: str = "ru"

    class Config:
        from_attributes = True


class OrgProfileUpdateRequest(BaseModel):
    org_name: str | None = None
    org_name_short: str | None = None
    leader_name: str | None = None
    mission: str | None = None
    key_products: str | None = None
    key_stats: str | None = None
    strategic_priorities: str | None = None
    writing_rules: str | None = None
    forbidden_words: str | None = None
    language: str = "ru"


@router.get("", response_model=OrgProfileResponse | None)
def get_org_profile(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    profile = db.query(CompanyProfile).first()
    if not profile:
        return None
    return OrgProfileResponse.model_validate(profile)


@router.put("", response_model=OrgProfileResponse)
def update_org_profile(
    body: OrgProfileUpdateRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    profile = db.query(CompanyProfile).first()
    if not profile:
        profile = CompanyProfile()
        db.add(profile)

    for field, value in body.model_dump().items():
        setattr(profile, field, value)
    profile.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(profile)
    return OrgProfileResponse.model_validate(profile)
