import secrets
from datetime import datetime, timezone, timedelta
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base


class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    slug = Column(String(100), nullable=False, unique=True, index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    users = relationship("User", back_populates="company")


class InviteToken(Base):
    __tablename__ = "invite_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), nullable=False, unique=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    email = Column(String(255), nullable=True)   # optional: lock to specific email
    note = Column(Text, nullable=True)           # admin comment
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime, nullable=True)
    used_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    company = relationship("Company")
    created_by = relationship("User", foreign_keys=[created_by_id])
    used_by = relationship("User", foreign_keys=[used_by_id])

    @staticmethod
    def generate(company_id: int, created_by_id: int, days: int = 7, email: str | None = None, note: str | None = None) -> "InviteToken":
        expires = datetime.now(timezone.utc) + timedelta(days=days)
        return InviteToken(
            token=secrets.token_urlsafe(32),
            company_id=company_id,
            created_by_id=created_by_id,
            email=email,
            note=note,
            expires_at=expires,
        )

    @property
    def is_valid(self) -> bool:
        if self.used_at:
            return False
        if datetime.now(timezone.utc) > (self.expires_at.replace(tzinfo=timezone.utc) if self.expires_at.tzinfo is None else self.expires_at):
            return False
        return True
