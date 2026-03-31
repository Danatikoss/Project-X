"""
User profile routes.
GET  /api/profile
PATCH /api/profile
"""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models.user import UserProfile
from api.schemas import UserProfileResponse, UserProfilePatchRequest

router = APIRouter()


def _get_or_create_profile(db: Session) -> UserProfile:
    profile = db.query(UserProfile).first()
    if not profile:
        profile = UserProfile()
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


@router.get("", response_model=UserProfileResponse)
def get_profile(db: Session = Depends(get_db)):
    profile = _get_or_create_profile(db)
    tags = json.loads(profile.preferred_tags_json or "[]")
    return UserProfileResponse(
        id=profile.id,
        name=profile.name,
        company=profile.company,
        contact_slide_id=profile.contact_slide_id,
        preferred_tags=tags,
    )


@router.patch("", response_model=UserProfileResponse)
def update_profile(body: UserProfilePatchRequest, db: Session = Depends(get_db)):
    profile = _get_or_create_profile(db)

    if body.name is not None:
        profile.name = body.name
    if body.company is not None:
        profile.company = body.company
    if body.contact_slide_id is not None:
        profile.contact_slide_id = body.contact_slide_id
    if body.preferred_tags is not None:
        profile.preferred_tags_json = json.dumps(body.preferred_tags, ensure_ascii=False)

    profile.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(profile)

    tags = json.loads(profile.preferred_tags_json or "[]")
    return UserProfileResponse(
        id=profile.id,
        name=profile.name,
        company=profile.company,
        contact_slide_id=profile.contact_slide_id,
        preferred_tags=tags,
    )
