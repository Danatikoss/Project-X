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

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from jose import jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models.user import User, UserProfile, RefreshToken
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
        path="/api/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=_COOKIE_NAME, path="/api/auth")


def _auth_response(user: User, db: Session, response: Response) -> AccessTokenResponse:
    refresh = _make_refresh_token(user.id)
    _store_refresh_token(db, user.id, refresh)
    db.commit()
    _set_refresh_cookie(response, refresh)
    return AccessTokenResponse(
        access_token=_make_access_token(user.id),
        user=UserOut(id=user.id, email=user.email, name=user.name,
                     is_admin=bool(user.is_admin)),
    )


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/register", response_model=AccessTokenResponse, status_code=201)
@limiter.limit("5/minute")
def register(request: Request, response: Response, body: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Email уже зарегистрирован")

    user = User(
        email=body.email,
        hashed_password=_hash(body.password),
        name=body.name or None,
    )
    db.add(user)
    db.flush()
    db.add(UserProfile(user_id=user.id))
    db.flush()
    db.refresh(user)
    return _auth_response(user, db, response)


@router.post("/login", response_model=AccessTokenResponse)
@limiter.limit("10/minute")
def login(request: Request, response: Response, body: LoginRequest, db: Session = Depends(get_db)):
    from models.stats import SecurityEvent
    ip = (request.headers.get("X-Real-IP")
          or request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
          or (request.client.host if request.client else "unknown"))

    user = db.query(User).filter(User.email == body.email).first()
    if not user or not _verify(body.password, user.hashed_password):
        db.add(SecurityEvent(event_type="failed_login", ip=ip, email=body.email, detail="wrong_credentials"))
        db.commit()
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
    return UserOut(id=user.id, email=user.email, name=user.name,
                   is_admin=bool(user.is_admin))
