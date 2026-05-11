"""
Auth routes: register, login, refresh, logout, me.
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/auth/me

Refresh token is stored in an httpOnly Secure cookie — never exposed to JS.
Access token is returned in the response body and kept in memory on the client.
"""
from datetime import datetime, timedelta, timezone
import smtplib
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from jose import jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models.user import User, UserProfile, RefreshToken
from models.company import InviteToken
from api.deps import get_current_user
from rate_limit import limiter

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

_COOKIE_NAME = "slidex_refresh"
_COOKIE_MAX_AGE = settings.refresh_token_expire_days * 86400


# ─── Schemas ─────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    name: str = Field(default="", max_length=100)
    invite_token: str = Field(..., min_length=10)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    id: int
    email: str
    name: str | None
    is_admin: bool = False
    company_id: int | None = None
    company_name: str | None = None


AccessTokenResponse.model_rebuild()


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _hash(password: str) -> str:
    return pwd_context.hash(password)


def _verify(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _make_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode({"sub": str(user_id), "exp": expire, "type": "access"},
                      settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _make_refresh_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    return jwt.encode({"sub": str(user_id), "exp": expire, "type": "refresh"},
                      settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _store_refresh_token(db: Session, user_id: int, token: str) -> None:
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    db.add(RefreshToken(
        user_id=user_id,
        token_hash=RefreshToken.hash(token),
        expires_at=expires_at,
    ))


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=_COOKIE_MAX_AGE,
        path="/",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=_COOKIE_NAME, path="/")
    # Also clear legacy cookie that was set with path="/api/auth"
    response.delete_cookie(key=_COOKIE_NAME, path="/api/auth")


_LOCKOUT_THRESHOLD = 5
_LOCKOUT_WINDOW = timedelta(minutes=15)


def _get_recent_failures(db: Session, email: str) -> int:
    from models.stats import SecurityEvent
    since = datetime.now(timezone.utc) - _LOCKOUT_WINDOW
    return (
        db.query(SecurityEvent)
        .filter(
            SecurityEvent.email == email,
            SecurityEvent.event_type == "failed_login",
            SecurityEvent.created_at >= since,
        )
        .count()
    )


def _send_security_alert(email: str, ip: str) -> None:
    if not settings.smtp_host or not settings.alert_email:
        return

    def _send():
        try:
            msg = MIMEMultipart()
            msg["From"] = settings.smtp_from or settings.smtp_user
            msg["To"] = settings.alert_email
            msg["Subject"] = "SLIDEX: попытка входа в ваш аккаунт"
            body = (
                f"Кто-то пытается войти в ваш аккаунт SLIDEX.\n\n"
                f"Email: {email}\n"
                f"IP: {ip}\n"
                f"Время: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}\n\n"
                f"После 5 неудачных попыток аккаунт блокируется на 15 минут.\n"
                f"Если это не вы — смените пароль."
            )
            msg.attach(MIMEText(body, "plain"))
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as srv:
                srv.starttls()
                srv.login(settings.smtp_user, settings.smtp_password)
                srv.send_message(msg)
        except Exception:
            pass

    threading.Thread(target=_send, daemon=True).start()


def _auth_response(user: User, db: Session, response: Response) -> AccessTokenResponse:
    refresh = _make_refresh_token(user.id)
    _store_refresh_token(db, user.id, refresh)
    db.commit()
    _set_refresh_cookie(response, refresh)
    return AccessTokenResponse(
        access_token=_make_access_token(user.id),
        user=UserOut(
            id=user.id, email=user.email, name=user.name,
            is_admin=bool(user.is_admin),
            company_id=user.company_id,
            company_name=user.company.name if user.company else None,
        ),
    )


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/invite-info")
def invite_info(token: str, db: Session = Depends(get_db)):
    """Return company name for an invite token (for pre-filling the registration form)."""
    invite = db.query(InviteToken).filter(InviteToken.token == token).first()
    if not invite or not invite.is_valid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Приглашение недействительно или истекло")
    return {"company_id": invite.company_id, "company_name": invite.company.name, "email": invite.email}


@router.post("/register", response_model=AccessTokenResponse, status_code=201)
@limiter.limit("5/minute")
def register(request: Request, response: Response, body: RegisterRequest, db: Session = Depends(get_db)):
    invite = db.query(InviteToken).filter(InviteToken.token == body.invite_token).first()
    if not invite or not invite.is_valid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Приглашение недействительно или истекло")
    if invite.email and invite.email.lower() != body.email.lower():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Email не совпадает с приглашением")

    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Email уже зарегистрирован")

    user = User(
        email=body.email,
        hashed_password=_hash(body.password),
        name=body.name or None,
        company_id=invite.company_id,
    )
    db.add(user)
    db.flush()
    db.add(UserProfile(user_id=user.id))
    invite.used_at = datetime.now(timezone.utc)
    invite.used_by_id = user.id
    db.flush()
    db.refresh(user)
    return _auth_response(user, db, response)


@router.post("/login", response_model=AccessTokenResponse)
@limiter.limit("5/minute")
def login(request: Request, response: Response, body: LoginRequest, db: Session = Depends(get_db)):
    from models.stats import SecurityEvent
    ip = (request.headers.get("X-Real-IP")
          or request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
          or (request.client.host if request.client else "unknown"))

    recent_failures = _get_recent_failures(db, body.email)
    if recent_failures >= _LOCKOUT_THRESHOLD:
        db.add(SecurityEvent(event_type="failed_login", ip=ip, email=body.email, detail="account_locked"))
        db.commit()
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Слишком много попыток входа. Попробуйте через 15 минут.",
        )

    user = db.query(User).filter(User.email == body.email).first()
    if not user or not _verify(body.password, user.hashed_password):
        db.add(SecurityEvent(event_type="failed_login", ip=ip, email=body.email, detail="wrong_credentials"))
        db.commit()
        # Send alert only on first failure in this lockout window
        if recent_failures == 0 and user and user.is_admin:
            _send_security_alert(body.email, ip)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Неверный email или пароль")
    if not user.is_active:
        db.add(SecurityEvent(event_type="failed_login", ip=ip, email=body.email, detail="account_disabled"))
        db.commit()
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Аккаунт деактивирован")
    return _auth_response(user, db, response)


@router.post("/refresh", response_model=AccessTokenResponse)
def refresh(
    response: Response,
    db: Session = Depends(get_db),
    refresh_token: str | None = Cookie(default=None, alias=_COOKIE_NAME),
):
    from jose import JWTError
    if not refresh_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Refresh token отсутствует")
    try:
        payload = jwt.decode(refresh_token, settings.jwt_secret,
                             algorithms=[settings.jwt_algorithm])
        if payload.get("type") != "refresh":
            raise ValueError
        user_id = int(payload["sub"])
    except (JWTError, ValueError, KeyError):
        _clear_refresh_cookie(response)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Недействительный refresh token")

    token_hash = RefreshToken.hash(refresh_token)
    stored = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if not stored:
        _clear_refresh_cookie(response)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Недействительный refresh token")

    db.delete(stored)

    user = db.query(User).get(user_id)
    if not user or not user.is_active:
        _clear_refresh_cookie(response)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Пользователь не найден")
    return _auth_response(user, db, response)


@router.post("/logout", status_code=204)
def logout(
    response: Response,
    db: Session = Depends(get_db),
    refresh_token: str | None = Cookie(default=None, alias=_COOKIE_NAME),
):
    if refresh_token:
        token_hash = RefreshToken.hash(refresh_token)
        stored = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
        if stored:
            db.delete(stored)
            db.commit()
    _clear_refresh_cookie(response)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return UserOut(
        id=user.id, email=user.email, name=user.name,
        is_admin=bool(user.is_admin),
        company_id=user.company_id,
        company_name=user.company.name if user.company else None,
    )
