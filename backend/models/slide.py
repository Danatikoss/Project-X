from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean, Index
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base



class SourcePresentation(Base):
    __tablename__ = "source_presentations"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_type = Column(String, nullable=False)       # "pptx" | "pdf"
    slide_count = Column(Integer, default=0)
    status = Column(String, default="pending")       # pending|indexing|done|error
    error_message = Column(Text, nullable=True)
    uploaded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    indexed_at = Column(DateTime, nullable=True)

    owner = relationship("User", back_populates="sources")
    slides = relationship("SlideLibraryEntry", back_populates="source", cascade="all, delete-orphan")


class SlideLibraryEntry(Base):
    __tablename__ = "slide_library_entries"

    id = Column(Integer, primary_key=True, index=True)
    source_id = Column(Integer, ForeignKey("source_presentations.id"), nullable=False)
    slide_index = Column(Integer, nullable=False)    # 0-based position in source

    thumbnail_path = Column(String, nullable=True)  # relative path: "{source_id}/{idx}.png"
    xml_blob = Column(Text, nullable=True)           # raw PPTX slide XML for lossless re-export
    slide_json = Column(Text, nullable=True)         # JSON blob for PDF-sourced slides

    title = Column(String, nullable=True)
    summary = Column(Text, nullable=True)
    tags_json = Column(Text, default="[]")           # JSON array: AI-generated keywords
    labels_json = Column(Text, default="[]")         # JSON array: user-defined labels
    layout_type = Column(String, nullable=True)      # title|content|chart|image|table|section|blank
    language = Column(String, default="ru")

    embedding_json = Column(Text, nullable=True)     # JSON float array, 1536-dim

    has_media = Column(Boolean, default=False)           # slide contains video or GIF
    gif_path = Column(String, nullable=True)     # relative path to extracted GIF
    gif_rect_json = Column(Text, nullable=True)  # JSON {x,y,w,h} as fractions of slide dims
    video_path = Column(String, nullable=True)   # relative path to extracted video (mp4)

    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)

    is_outdated = Column(Boolean, default=False)
    access_level = Column(String, default="internal")  # public|internal|confidential

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    source = relationship("SourcePresentation", back_populates="slides")
    project = relationship("Project", back_populates="slides")

    __table_args__ = (
        Index("ix_slide_source_id", "source_id"),
        Index("ix_slide_layout_type", "layout_type"),
        Index("ix_slide_language", "language"),
        Index("ix_slide_is_outdated", "is_outdated"),
        Index("ix_slide_access_level", "access_level"),
    )
