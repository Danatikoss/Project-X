from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base


class AssembledPresentation(Base):
    __tablename__ = "assembled_presentations"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    title = Column(String, default="Без названия")
    prompt = Column(Text, nullable=False)
    slide_ids_json = Column(Text, default="[]")
    overlays_json = Column(Text, default="{}")   # {"slide_id": [{id,asset_id,url,file_type,x,y,w,h}]}
    status = Column(String, default="draft")
    export_path = Column(String, nullable=True)
    share_token = Column(String, nullable=True, unique=True, index=True)
    # Brand template used when generating this assembly (needed for PPTX re-render on export)
    brand_template_id = Column(Integer, ForeignKey("brand_templates.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    owner = relationship("User", back_populates="assemblies")
    brand_template = relationship("BrandTemplate", foreign_keys=[brand_template_id])
