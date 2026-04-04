"""
Admin-only endpoints.

POST /api/admin/bootstrap   — make current user admin if no admins exist yet
GET  /api/admin/users       — list all users (admin only)
PATCH /api/admin/users/{id} — toggle is_admin flag (admin only)
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import get_current_user, get_admin_user
from database import get_db
from models.user import User

router = APIRouter()


class UserAdminOut(BaseModel):
    id: int
    email: str
    name: str | None
    is_admin: bool
    is_active: bool

    class Config:
        from_attributes = True


class ToggleAdminRequest(BaseModel):
    is_admin: bool


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
    return db.query(User).order_by(User.id).all()


@router.patch("/users/{user_id}", response_model=UserAdminOut)
def toggle_admin(
    user_id: int,
    body: ToggleAdminRequest,
    db: Session = Depends(get_db),
    current: User = Depends(get_admin_user),
):
    target = db.query(User).get(user_id)
    if not target:
        raise HTTPException(404, "User not found")
    # Prevent removing own admin rights if you're the only admin
    if target.id == current.id and not body.is_admin:
        remaining = db.query(User).filter(User.is_admin == True, User.id != current.id).count()
        if remaining == 0:
            raise HTTPException(400, "Cannot remove your own admin rights — no other admins exist")
    target.is_admin = body.is_admin
    db.commit()
    db.refresh(target)
    return target
