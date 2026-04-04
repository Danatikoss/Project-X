from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    name = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    sources = relationship("SourcePresentation", back_populates="owner")
    assemblies = relationship("AssembledPresentation", back_populates="owner")
    projects = relationship("Project", back_populates="owner")
    profile = relationship("UserProfile", back_populates="user", uselist=False)


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, unique=True, index=True)
    name = Column(String, nullable=True)
    company = Column(String, nullable=True)
    position = Column(String, nullable=True)          # должность / роль спикера
    contact_slide_id = Column(Integer, ForeignKey("slide_library_entries.id"), nullable=True)
    preferred_tags_json = Column(Text, default="[]")
    default_language = Column(String, default="ru")   # "ru" | "kk" | "en"
    ai_style = Column(String, default="official")     # "official" | "neutral" | "casual"
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="profile")
