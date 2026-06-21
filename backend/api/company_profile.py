"""
Company Profile API — admin-controlled org context for AI generation.
GET  /api/org-profile        — any authenticated user
PUT  /api/org-profile        — admin only
POST /api/org-profile/logo   — super-admin only
"""
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import get_current_user, get_admin_user, get_company_id
from config import settings
from database import get_db
from models.company_profile import CompanyProfile
from models.user import User

router = APIRouter()

LOGO_DIR = Path(settings.upload_dir) / "org_logos"
LOGO_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/svg+xml", "image/webp"}


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
    logo_url: str | None = None

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
    company_id: int = Depends(get_company_id),
):
    profile = db.query(CompanyProfile).filter(
        CompanyProfile.company_id == company_id
    ).first()
    if not profile:
        return None
    return OrgProfileResponse.model_validate(profile)


@router.put("", response_model=OrgProfileResponse)
def update_org_profile(
    body: OrgProfileUpdateRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
    company_id: int = Depends(get_company_id),
):
    profile = db.query(CompanyProfile).filter(
        CompanyProfile.company_id == company_id
    ).first()
    if not profile:
        profile = CompanyProfile(company_id=company_id)
        db.add(profile)

    for field, value in body.model_dump().items():
        setattr(profile, field, value)
    profile.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(profile)
    return OrgProfileResponse.model_validate(profile)


@router.post("/logo", response_model=OrgProfileResponse)
async def upload_org_logo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
    company_id: int = Depends(get_company_id),
):
    if not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Только для супер-администратора")
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Разрешены только PNG, JPG, SVG, WebP")

    contents = await file.read()
    if len(contents) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс. 2 МБ)")

    ext = Path(file.filename or "logo.png").suffix or ".png"
    filename = f"{company_id}_{uuid.uuid4().hex[:8]}{ext}"
    dest = LOGO_DIR / filename
    dest.write_bytes(contents)

    profile = db.query(CompanyProfile).filter(CompanyProfile.company_id == company_id).first()
    if not profile:
        profile = CompanyProfile(company_id=company_id)
        db.add(profile)

    profile.logo_url = f"/org-logos/{filename}"
    profile.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(profile)
    return OrgProfileResponse.model_validate(profile)
