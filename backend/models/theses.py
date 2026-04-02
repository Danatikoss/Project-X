from sqlalchemy import Column, Integer, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base


class AssemblyTheses(Base):
    __tablename__ = "assembly_theses"
    __table_args__ = (UniqueConstraint("assembly_id", name="uq_assembly_theses_assembly_id"),)

    id = Column(Integer, primary_key=True, index=True)
    assembly_id = Column(Integer, ForeignKey("assembled_presentations.id", ondelete="CASCADE"), nullable=False, index=True)

    # {"slide_id": {"ru": ["...","..."], "kk": ["...","..."], "en": ["...","..."]}}
    theses_json = Column(Text, default="{}")

    # Context answers provided by the user before generation, e.g. {"audience": "...", "goal": "..."}
    context_json = Column(Text, default="{}")

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))
