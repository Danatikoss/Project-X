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

from fastapi import Request
from api.deps import get_current_user, get_admin_user, get_company_id_optional
from database import get_db
from models.user import User
from models.company import Company, InviteToken

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ─── Company schemas ──────────────────────────────────────────────────────────

class CompanyOut(BaseModel):
    id: int
    name: str
    slug: str
    is_active: bool
    user_count: int = 0
    created_at: datetime | None

    class Config:
        from_attributes = True


class CompanyCreate(BaseModel):
    name: str
    slug: str


class InviteOut(BaseModel):
    id: int
    token: str
    company_id: int
    company_name: str
    email: str | None
    note: str | None
    expires_at: datetime
    used_at: datetime | None
    used_by_name: str | None
    created_at: datetime | None


class InviteCreate(BaseModel):
    company_id: int
    email: str | None = None
    note: str | None = None
    days: int = 7


# ─── User schemas ─────────────────────────────────────────────────────────────

class UserAdminOut(BaseModel):
    id: int
    email: str
    name: str | None
    is_admin: bool
    is_active: bool
    company_id: int | None
    company_name: str | None
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


# ─── Companies ────────────────────────────────────────────────────────────────

@router.get("/companies", response_model=list[CompanyOut])
def list_companies(db: Session = Depends(get_db), _: User = Depends(get_admin_user)):
    companies = db.query(Company).order_by(Company.id).all()
    result = []
    for c in companies:
        count = db.query(User).filter(User.company_id == c.id).count()
        result.append(CompanyOut(
            id=c.id, name=c.name, slug=c.slug, is_active=c.is_active,
            user_count=count, created_at=c.created_at,
        ))
    return result


@router.post("/companies", response_model=CompanyOut, status_code=201)
def create_company(body: CompanyCreate, db: Session = Depends(get_db), _: User = Depends(get_admin_user)):
    if db.query(Company).filter(Company.slug == body.slug).first():
        raise HTTPException(409, "Компания с таким slug уже существует")
    company = Company(name=body.name, slug=body.slug)
    db.add(company)
    db.commit()
    db.refresh(company)
    return CompanyOut(id=company.id, name=company.name, slug=company.slug,
                      is_active=company.is_active, user_count=0, created_at=company.created_at)


# ─── Invites ──────────────────────────────────────────────────────────────────

@router.get("/invites", response_model=list[InviteOut])
def list_invites(
    company_id: int | None = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_admin_user),
):
    q = db.query(InviteToken)
    if current.is_super_admin:
        if company_id:
            q = q.filter(InviteToken.company_id == company_id)
    else:
        q = q.filter(InviteToken.company_id == current.company_id)
    invites = q.order_by(InviteToken.created_at.desc()).all()
    return [_invite_out(i) for i in invites]


@router.post("/invites", response_model=InviteOut, status_code=201)
def create_invite(body: InviteCreate, db: Session = Depends(get_db), current: User = Depends(get_admin_user)):
    company_id = body.company_id if current.is_super_admin else current.company_id
    if not db.query(Company).get(company_id):
        raise HTTPException(404, "Компания не найдена")
    invite = InviteToken.generate(
        company_id=company_id,
        created_by_id=current.id,
        days=body.days,
        email=body.email,
        note=body.note,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return _invite_out(invite)


@router.delete("/invites/{invite_id}", status_code=204)
def delete_invite(invite_id: int, db: Session = Depends(get_db), current: User = Depends(get_admin_user)):
    invite = db.query(InviteToken).get(invite_id)
    if not invite:
        raise HTTPException(404, "Приглашение не найдено")
    if not current.is_super_admin and invite.company_id != current.company_id:
        raise HTTPException(403, "Нет доступа")
    db.delete(invite)
    db.commit()


def _invite_out(i: InviteToken) -> InviteOut:
    return InviteOut(
        id=i.id,
        token=i.token,
        company_id=i.company_id,
        company_name=i.company.name if i.company else "",
        email=i.email,
        note=i.note,
        expires_at=i.expires_at,
        used_at=i.used_at,
        used_by_name=i.used_by.name or i.used_by.email if i.used_by else None,
        created_at=i.created_at,
    )


@router.get("/users", response_model=list[UserAdminOut])
def list_users(
    company_id: int | None = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_admin_user),
):
    from models.assembly import AssembledPresentation
    from sqlalchemy import func

    counts = dict(
        db.query(AssembledPresentation.owner_id, func.count(AssembledPresentation.id))
        .filter(AssembledPresentation.owner_id.isnot(None))
        .group_by(AssembledPresentation.owner_id)
        .all()
    )
    q = db.query(User)
    if current.is_super_admin:
        if company_id:
            q = q.filter(User.company_id == company_id)
    else:
        q = q.filter(User.company_id == current.company_id)
    users = q.order_by(User.id).all()
    result = []
    for u in users:
        result.append(UserAdminOut(
            id=u.id, email=u.email, name=u.name,
            is_admin=bool(u.is_admin), is_active=bool(u.is_active),
            company_id=u.company_id,
            company_name=u.company.name if u.company else None,
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
        company_id=target.company_id,
        company_name=target.company.name if target.company else None,
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
    request: Request,
    db: Session = Depends(get_db),
    current: User = Depends(get_admin_user),
    company_id: int | None = None,
):
    from models.assembly import AssembledPresentation
    from models.stats import GenerationLog
    from services.template_library import load_catalog
    from sqlalchemy import func

    # Determine company scope
    scope_company_id = company_id
    if not current.is_super_admin:
        scope_company_id = current.company_id
    elif not scope_company_id:
        header = request.headers.get("X-Active-Company")
        scope_company_id = int(header) if header else None

    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    def _user_ids_in_scope() -> list[int]:
        q = db.query(User.id)
        if scope_company_id:
            q = q.filter(User.company_id == scope_company_id)
        return [r[0] for r in q.all()]

    user_ids = _user_ids_in_scope()

    # ── Users ──────────────────────────────────────────────────────────────────
    uq = db.query(User)
    if scope_company_id:
        uq = uq.filter(User.company_id == scope_company_id)
    total_users = uq.count()
    new_users_7d = uq.filter(User.created_at >= week_ago).count()

    # Returning users: have 2+ presentations
    ap_q = db.query(AssembledPresentation).filter(AssembledPresentation.owner_id.isnot(None))
    if user_ids:
        ap_q = ap_q.filter(AssembledPresentation.owner_id.in_(user_ids))
    elif scope_company_id and not user_ids:
        ap_q = ap_q.filter(False)  # no users in scope
    returning_users = (
        db.query(func.count())
        .select_from(
            ap_q.group_by(AssembledPresentation.owner_id)
            .having(func.count(AssembledPresentation.id) >= 2)
            .subquery()
        )
        .scalar() or 0
    )
    users_with_any = (
        ap_q.with_entities(func.count(func.distinct(AssembledPresentation.owner_id)))
        .scalar() or 0
    )
    retention_rate = round(returning_users / users_with_any * 100) if users_with_any else 0

    # ── Presentations ──────────────────────────────────────────────────────────
    pres_q = db.query(AssembledPresentation)
    if user_ids:
        pres_q = pres_q.filter(AssembledPresentation.owner_id.in_(user_ids))
    elif scope_company_id and not user_ids:
        pres_q = pres_q.filter(False)
    total_presentations = pres_q.count()
    new_presentations_7d = pres_q.filter(AssembledPresentation.created_at >= week_ago).count()

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
    top_q = db.query(
        AssembledPresentation.owner_id,
        func.count(AssembledPresentation.id).label("cnt"),
    ).filter(AssembledPresentation.owner_id.isnot(None))
    if user_ids:
        top_q = top_q.filter(AssembledPresentation.owner_id.in_(user_ids))
    top_rows = (
        top_q.group_by(AssembledPresentation.owner_id)
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

    # ── Ratings ────────────────────────────────────────────────────────────────
    from models.stats import PresentationRating
    import json as _json

    total_ratings = db.query(func.count(PresentationRating.id)).scalar() or 0
    avg_stars_raw = db.query(func.avg(PresentationRating.stars)).scalar()
    avg_stars = round(float(avg_stars_raw), 2) if avg_stars_raw else None

    # Distribution 1..5
    stars_dist = {}
    for s in range(1, 6):
        stars_dist[str(s)] = db.query(func.count(PresentationRating.id)).filter(
            PresentationRating.stars == s
        ).scalar() or 0

    # Top tags from low ratings (≤2)
    low_ratings = db.query(PresentationRating.tags).filter(PresentationRating.stars <= 2).all()
    tag_counter: dict[str, int] = {}
    for (tags_json,) in low_ratings:
        for tag in _json.loads(tags_json or "[]"):
            tag_counter[tag] = tag_counter.get(tag, 0) + 1
    top_issues = sorted(tag_counter.items(), key=lambda x: x[1], reverse=True)[:5]

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
        "ratings": {
            "total": total_ratings,
            "avg_stars": avg_stars,
            "distribution": stars_dist,
            "top_issues": [{"tag": t, "count": c} for t, c in top_issues],
        },
    }


@router.get("/security")
def get_security(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    from models.stats import SecurityEvent
    import re, os

    # ── App-level events (failed logins) ──────────────────────────────────────
    events = (
        db.query(SecurityEvent)
        .order_by(SecurityEvent.created_at.desc())
        .limit(100)
        .all()
    )
    events_list = [
        {
            "id": e.id,
            "type": e.event_type,
            "ip": e.ip,
            "email": e.email,
            "detail": e.detail,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in events
    ]

    # Top attacking IPs
    from sqlalchemy import func
    top_ips = (
        db.query(SecurityEvent.ip, func.count(SecurityEvent.id).label("cnt"))
        .filter(SecurityEvent.event_type == "failed_login", SecurityEvent.ip.isnot(None))
        .group_by(SecurityEvent.ip)
        .order_by(func.count(SecurityEvent.id).desc())
        .limit(10)
        .all()
    )

    # Top targeted emails
    top_emails = (
        db.query(SecurityEvent.email, func.count(SecurityEvent.id).label("cnt"))
        .filter(SecurityEvent.event_type == "failed_login", SecurityEvent.email.isnot(None))
        .group_by(SecurityEvent.email)
        .order_by(func.count(SecurityEvent.id).desc())
        .limit(10)
        .all()
    )

    # ── fail2ban banned IPs (parse log file if available) ─────────────────────
    banned = []
    log_path = "/var/log/fail2ban.log"
    if os.path.exists(log_path):
        try:
            ban_re = re.compile(r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*\[sshd\] Ban (\S+)")
            unban_re = re.compile(r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*\[sshd\] Unban (\S+)")
            currently_banned: dict[str, str] = {}
            with open(log_path, "r", errors="replace") as f:
                for line in f:
                    m = ban_re.search(line)
                    if m:
                        currently_banned[m.group(2)] = m.group(1)
                        continue
                    m = unban_re.search(line)
                    if m:
                        currently_banned.pop(m.group(2), None)
            banned = [{"ip": ip, "banned_at": ts} for ip, ts in currently_banned.items()]
        except Exception:
            pass

    return {
        "events": events_list,
        "top_ips": [{"ip": r.ip, "count": r.cnt} for r in top_ips],
        "top_emails": [{"email": r.email, "count": r.cnt} for r in top_emails],
        "fail2ban_banned": banned,
        "total_failed_logins": db.query(func.count(SecurityEvent.id))
            .filter(SecurityEvent.event_type == "failed_login").scalar() or 0,
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
