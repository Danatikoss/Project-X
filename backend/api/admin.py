"""
Admin-only endpoints.

POST /api/admin/bootstrap              — make current user admin if no admins exist yet
GET  /api/admin/users                  — list all users with stats (admin only)
PATCH /api/admin/users/{id}            — update is_admin / is_active flags (admin only)
POST /api/admin/users/{id}/reset-password — generate temp password (admin only)
GET  /api/admin/stats                  — platform statistics (admin only)
"""
import secrets
import string
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import get_current_user, get_admin_user
from database import get_db
from models.user import User

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class UserAdminOut(BaseModel):
    id: int
    email: str
    name: str | None
    is_admin: bool
    is_active: bool
    created_at: datetime | None
    presentations_count: int = 0

    class Config:
        from_attributes = True


class PatchUserRequest(BaseModel):
    is_admin: bool | None = None
    is_active: bool | None = None


class ResetPasswordResponse(BaseModel):
    temp_password: str


@router.post("/bootstrap", response_model=UserAdminOut)
def bootstrap_admin(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Make the calling user an admin — only works if NO admins exist yet."""
    admin_count = db.query(User).filter(User.is_admin == True).count()
    if admin_count > 0:
        raise HTTPException(403, "Admin already exists. Use toggle-admin instead.")
    user.is_admin = True
    db.commit()
    db.refresh(user)
    return user


@router.get("/users", response_model=list[UserAdminOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    from models.assembly import AssembledPresentation
    from sqlalchemy import func

    counts = dict(
        db.query(AssembledPresentation.owner_id, func.count(AssembledPresentation.id))
        .filter(AssembledPresentation.owner_id.isnot(None))
        .group_by(AssembledPresentation.owner_id)
        .all()
    )
    users = db.query(User).order_by(User.id).all()
    result = []
    for u in users:
        result.append(UserAdminOut(
            id=u.id,
            email=u.email,
            name=u.name,
            is_admin=bool(u.is_admin),
            is_active=bool(u.is_active),
            created_at=u.created_at,
            presentations_count=counts.get(u.id, 0),
        ))
    return result


@router.patch("/users/{user_id}", response_model=UserAdminOut)
def patch_user(
    user_id: int,
    body: PatchUserRequest,
    db: Session = Depends(get_db),
    current: User = Depends(get_admin_user),
):
    from models.assembly import AssembledPresentation
    from sqlalchemy import func

    target = db.query(User).get(user_id)
    if not target:
        raise HTTPException(404, "User not found")

    if body.is_admin is not None:
        if target.id == current.id and not body.is_admin:
            remaining = db.query(User).filter(User.is_admin == True, User.id != current.id).count()
            if remaining == 0:
                raise HTTPException(400, "Нельзя снять права — других администраторов нет")
        target.is_admin = body.is_admin

    if body.is_active is not None:
        if target.id == current.id and not body.is_active:
            raise HTTPException(400, "Нельзя деактивировать собственный аккаунт")
        target.is_active = body.is_active

    db.commit()
    db.refresh(target)

    pcount = db.query(func.count(AssembledPresentation.id)).filter_by(owner_id=target.id).scalar() or 0
    return UserAdminOut(
        id=target.id, email=target.email, name=target.name,
        is_admin=bool(target.is_admin), is_active=bool(target.is_active),
        created_at=target.created_at, presentations_count=pcount,
    )


@router.post("/users/{user_id}/reset-password", response_model=ResetPasswordResponse)
def reset_password(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    target = db.query(User).get(user_id)
    if not target:
        raise HTTPException(404, "User not found")
    alphabet = string.ascii_letters + string.digits
    temp_password = "".join(secrets.choice(alphabet) for _ in range(12))
    target.hashed_password = pwd_context.hash(temp_password)
    db.commit()
    return ResetPasswordResponse(temp_password=temp_password)


@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    from models.assembly import AssembledPresentation
    from models.stats import GenerationLog
    from services.template_library import load_catalog
    from sqlalchemy import func

    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    # ── Users ──────────────────────────────────────────────────────────────────
    total_users = db.query(func.count(User.id)).scalar() or 0
    new_users_7d = db.query(func.count(User.id)).filter(User.created_at >= week_ago).scalar() or 0

    # Returning users: have 2+ presentations
    returning_users = (
        db.query(func.count())
        .select_from(
            db.query(AssembledPresentation.owner_id)
            .filter(AssembledPresentation.owner_id.isnot(None))
            .group_by(AssembledPresentation.owner_id)
            .having(func.count(AssembledPresentation.id) >= 2)
            .subquery()
        )
        .scalar() or 0
    )
    users_with_any = (
        db.query(func.count(func.distinct(AssembledPresentation.owner_id)))
        .filter(AssembledPresentation.owner_id.isnot(None))
        .scalar() or 0
    )
    retention_rate = round(returning_users / users_with_any * 100) if users_with_any else 0

    # ── Presentations ──────────────────────────────────────────────────────────
    total_presentations = db.query(func.count(AssembledPresentation.id)).scalar() or 0
    new_presentations_7d = (
        db.query(func.count(AssembledPresentation.id))
        .filter(AssembledPresentation.created_at >= week_ago)
        .scalar() or 0
    )

    # ── Templates ─────────────────────────────────────────────────────────────
    try:
        catalog = load_catalog()
        total_templates = len(catalog)
    except Exception:
        total_templates = 0

    # ── Generation logs ────────────────────────────────────────────────────────
    def _avg(action: str) -> float | None:
        row = db.query(func.avg(GenerationLog.elapsed_seconds)).filter(
            GenerationLog.action == action
        ).scalar()
        return round(float(row), 1) if row else None

    def _count(action: str) -> int:
        return db.query(func.count(GenerationLog.id)).filter(
            GenerationLog.action == action
        ).scalar() or 0

    plans_total = _count("plan")
    downloads_total = _count("download")
    conversion_rate = round(downloads_total / plans_total * 100) if plans_total else 0

    avg_plan = _avg("plan")
    avg_download = _avg("download")
    avg_cycle: float | None = None
    if avg_plan is not None and avg_download is not None:
        avg_cycle = round(avg_plan + avg_download, 1)

    avg_slides = (
        db.query(func.avg(GenerationLog.slide_count))
        .filter(GenerationLog.action == "plan", GenerationLog.slide_count.isnot(None))
        .scalar()
    )
    avg_slides = round(float(avg_slides), 1) if avg_slides else None

    # ── Top users ──────────────────────────────────────────────────────────────
    top_rows = (
        db.query(
            AssembledPresentation.owner_id,
            func.count(AssembledPresentation.id).label("cnt"),
        )
        .filter(AssembledPresentation.owner_id.isnot(None))
        .group_by(AssembledPresentation.owner_id)
        .order_by(func.count(AssembledPresentation.id).desc())
        .limit(5)
        .all()
    )
    top_users = []
    for owner_id, cnt in top_rows:
        u = db.query(User).get(owner_id)
        top_users.append({
            "name": u.name or u.email if u else str(owner_id),
            "email": u.email if u else "",
            "presentations": cnt,
        })

    # ── Recent activity ────────────────────────────────────────────────────────
    recent = db.query(GenerationLog).order_by(GenerationLog.created_at.desc()).limit(15).all()
    recent_list = [
        {
            "action": r.action,
            "elapsed_seconds": r.elapsed_seconds,
            "slide_count": r.slide_count,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in recent
    ]

    return {
        "users": {
            "total": total_users,
            "new_7d": new_users_7d,
            "returning": returning_users,
            "retention_rate": retention_rate,
        },
        "presentations": {
            "total": total_presentations,
            "new_7d": new_presentations_7d,
            "avg_slides": avg_slides,
        },
        "templates": {
            "total": total_templates,
        },
        "funnel": {
            "plans": plans_total,
            "downloads": downloads_total,
            "conversion_rate": conversion_rate,
        },
        "cycle_time": {
            "avg_total_seconds": avg_cycle,
            "avg_plan_seconds": avg_plan,
            "avg_download_seconds": avg_download,
        },
        "top_users": top_users,
        "recent_activity": recent_list,
    }


def log_generation(
    db: Session,
    action: str,
    elapsed_seconds: float,
    user_id: int | None = None,
    slide_count: int | None = None,
):
    """Append a GenerationLog row. Call from generate endpoints after timing."""
    try:
        from models.stats import GenerationLog
        entry = GenerationLog(
            user_id=user_id,
            action=action,
            elapsed_seconds=round(elapsed_seconds, 3),
            slide_count=slide_count,
        )
        db.add(entry)
        db.commit()
    except Exception:
        db.rollback()
