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

    # ── Strict Brand Guidelines ──────────────────────────────────────────────
    background_image_path = Column(String, nullable=True)   # full filesystem path to bg image
    font_family = Column(String, default="Montserrat")
    title_font_color = Column(String, default="FFFFFF")      # hex, no #
    title_font_size = Column(Integer, default=30)            # pt
    body_font_color = Column(String, default="1E293B")       # hex, no #
    body_font_size = Column(Integer, default=18)             # pt
    shape_color = Column(String, default="1E3A8A")           # hex, primary accent color
    shape_opacity = Column(Integer, default=100)             # 0-100

    owner = relationship("User", backref="brand_templates")
