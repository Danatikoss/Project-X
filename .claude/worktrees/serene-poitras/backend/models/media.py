from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base


class MediaFolder(Base):
    __tablename__ = "media_folders"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    owner = relationship("User", backref="media_folders")
    assets = relationship("MediaAsset", back_populates="folder", cascade="all, delete-orphan")


class MediaAsset(Base):
    __tablename__ = "media_assets"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    folder_id = Column(Integer, ForeignKey("media_folders.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)   # relative: {uuid}.{ext}
    file_type = Column(String, nullable=False)   # gif | video | image
    mime_type = Column(String, nullable=True)
    file_size = Column(Integer, nullable=True)   # bytes
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    owner = relationship("User", backref="media_assets")
    folder = relationship("MediaFolder", back_populates="assets")
