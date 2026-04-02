from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base


class ThesesSession(Base):
    """
    Standalone theses generation session.
    Can be created from an assembly or any other source in the future.
    Stores a snapshot of slide metadata so it remains readable even if
    the source assembly is later modified or deleted.
    """
    __tablename__ = "theses_sessions"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Human-readable title (copied from assembly title or entered manually)
    title = Column(String, nullable=False, default="Тезисы")

    # Optional reference to the source assembly
    assembly_id = Column(Integer, ForeignKey("assembled_presentations.id", ondelete="SET NULL"), nullable=True)

    # Snapshot of slides at the time of creation: [{id, title, thumbnail_path, summary}]
    slide_snapshot_json = Column(Text, default="[]")

    # Generated theses: {"slide_id": {"ru": [...], "kk": [...], "en": [...]}}
    theses_json = Column(Text, default="{}")

    # Context answers provided by the user: {"audience": "...", "goal": "...", "emphasis": "..."}
    context_json = Column(Text, default="{}")

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))
