"""
User profile routes.
GET  /api/profile
PATCH /api/profile
GET  /api/profile/stats
"""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models.user import User, UserProfile
from models.assembly import AssembledPresentation
from models.slide import SlideLibraryEntry, SourcePresentation
from api.schemas import UserProfileResponse, UserProfilePatchRequest, ProfileStatsResponse
from api.deps import get_current_user

router = APIRouter()


def _get_or_create_profile(db: Session, user_id: int) -> UserProfile:
    profile = db.query(UserProfile).filter_by(user_id=user_id).first()
    if not profile:
        profile = UserProfile(user_id=user_id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def _profile_to_response(profile: UserProfile) -> UserProfileResponse:
    return UserProfileResponse(
        id=profile.id,
        name=profile.name,
        company=profile.company,
        position=profile.position,
        contact_slide_id=profile.contact_slide_id,
        preferred_tags=json.loads(profile.preferred_tags_json or "[]"),
        default_language=profile.default_language or "ru",
        ai_style=profile.ai_style or "official",
    )


@router.get("/stats", response_model=ProfileStatsResponse)
def get_stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    assemblies_count = db.query(AssembledPresentation).filter_by(owner_id=user.id).count()

    # Count slides via source presentations owned by this user
    source_ids = [
        r.id for r in
        db.query(SourcePresentation.id).filter_by(owner_id=user.id).all()
    ]
    slides_count = (
        db.query(SlideLibraryEntry)
        .filter(SlideLibraryEntry.source_id.in_(source_ids))
        .count()
        if source_ids else 0
    )

    return ProfileStatsResponse(
        assemblies_count=assemblies_count,
        slides_count=slides_count,
    )


@router.get("", response_model=UserProfileResponse)
def get_profile(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    profile = _get_or_create_profile(db, user.id)
    return _profile_to_response(profile)


@router.patch("", response_model=UserProfileResponse)
def update_profile(
    body: UserProfilePatchRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    profile = _get_or_create_profile(db, user.id)

    if body.name is not None:
        profile.name = body.name
    if body.company is not None:
        profile.company = body.company
    if body.position is not None:
        profile.position = body.position
    if "contact_slide_id" in body.model_fields_set:
        profile.contact_slide_id = body.contact_slide_id  # None clears it
    if body.preferred_tags is not None:
        profile.preferred_tags_json = json.dumps(body.preferred_tags, ensure_ascii=False)
    if body.default_language is not None:
        profile.default_language = body.default_language
    if body.ai_style is not None:
        profile.ai_style = body.ai_style

    profile.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(profile)
    return _profile_to_response(profile)
