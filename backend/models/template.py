from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from database import Base


class AssemblyTemplate(Base):
    __tablename__ = "assembly_templates"
    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    emoji = Column(String(10), default="📋")
    description = Column(String(200), default="")
    slide_count_hint = Column(Integer, default=8)
    color_hex = Column(String(7), default="#3b82f6")
    prompt = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
