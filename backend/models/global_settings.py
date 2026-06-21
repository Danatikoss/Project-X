from sqlalchemy import Column, Integer, Text, DateTime
from datetime import datetime, timezone
from database import Base

_DEFAULT_WRITING_RULES = (
    "Тезисы — не более 2 строк; "
    "без воды и общих фраз («активно развивается», «успешно реализуется»); "
    "цифры писать точно, без «около» и «примерно» — если данных нет, писать [данные]"
)


class GlobalSettings(Base):
    __tablename__ = "global_settings"

    id = Column(Integer, primary_key=True, default=1)
    base_writing_rules = Column(Text, nullable=True, default=_DEFAULT_WRITING_RULES)
    base_forbidden_words = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


def get_global_settings(db) -> GlobalSettings:
    row = db.query(GlobalSettings).filter(GlobalSettings.id == 1).first()
    if not row:
        row = GlobalSettings(id=1, base_writing_rules=_DEFAULT_WRITING_RULES)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row
