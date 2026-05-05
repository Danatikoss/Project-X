from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, UniqueConstraint
from datetime import datetime, timezone
from database import Base


class GenerationLog(Base):
    __tablename__ = "generation_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    action = Column(String, nullable=False, index=True)  # "plan" | "download" | "assembly" | "upload_template" | "upload_batch"
    elapsed_seconds = Column(Float, nullable=False)
    slide_count = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)


class PresentationRating(Base):
    __tablename__ = "presentation_ratings"
    __table_args__ = (UniqueConstraint("assembly_id", "user_id", name="uq_rating_assembly_user"),)

    id = Column(Integer, primary_key=True, index=True)
    assembly_id = Column(Integer, ForeignKey("assembled_presentations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    stars = Column(Integer, nullable=False)          # 1–5
    tags = Column(Text, default="[]")               # JSON array of tag strings
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
