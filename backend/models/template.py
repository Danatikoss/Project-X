from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from database import Base


class AssemblyTemplate(Base):
    __tablename__ = "assembly_templates"
    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(200), default="")
    slide_ids_json = Column(Text, default="[]")   # JSON array of SlideLibraryEntry IDs (ordered)
    overlays_json = Column(Text, default="{}")    # {"slide_id": [{id,asset_id,url,file_type,x,y,w,h}]}
    created_at = Column(DateTime, default=datetime.utcnow)
