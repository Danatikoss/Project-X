from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base


class BrandTemplate(Base):
    __tablename__ = "brand_templates"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    pptx_path = Column(String, nullable=True)        # uploaded PPTX template file
    colors_json = Column(Text, default="{}")          # extracted brand colors {primary, secondary, ...}
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    owner = relationship("User", backref="brand_templates")
