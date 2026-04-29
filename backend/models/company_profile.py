from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from database import Base


class CompanyProfile(Base):
    __tablename__ = "company_profiles"

    id = Column(Integer, primary_key=True)
    org_name = Column(String, nullable=True)
    org_name_short = Column(String, nullable=True)
    leader_name = Column(String, nullable=True)
    mission = Column(Text, nullable=True)
    key_products = Column(Text, nullable=True)
    key_stats = Column(Text, nullable=True)
    strategic_priorities = Column(Text, nullable=True)
    writing_rules = Column(Text, nullable=True)
    forbidden_words = Column(Text, nullable=True)
    language = Column(String, default="ru")
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


def get_company_context(db: Session) -> str:
    """Build a company context string to inject into AI generation prompts."""
    profile = db.query(CompanyProfile).first()
    if not profile:
        return ""

    parts = []
    if profile.org_name:
        name = profile.org_name
        if profile.org_name_short:
            name += f" ({profile.org_name_short})"
        parts.append(f"Организация: {name}")
    if profile.leader_name:
        parts.append(f"Руководитель: {profile.leader_name}")
    if profile.mission:
        parts.append(f"Миссия: {profile.mission}")
    if profile.key_products:
        parts.append(f"Продукты и сервисы: {profile.key_products}")
    if profile.key_stats:
        parts.append(f"Ключевые факты и цифры: {profile.key_stats}")
    if profile.strategic_priorities:
        parts.append(f"Стратегические приоритеты: {profile.strategic_priorities}")
    if profile.writing_rules:
        parts.append(f"Правила написания текста в слайдах: {profile.writing_rules}")
    if profile.forbidden_words:
        parts.append(f"ЗАПРЕЩЕНО использовать эти слова и фразы: {profile.forbidden_words}")
    if profile.language and profile.language != "ru":
        parts.append(f"Язык генерации: {profile.language}")

    if not parts:
        return ""

    return "### Контекст организации (следуй строго)\n" + "\n".join(parts)
