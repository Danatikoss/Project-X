from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from database import Base


class CompanyProfile(Base):
    __tablename__ = "company_profiles"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
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


BASE_WRITING_RULES = (
    "Тезисы — не более 2 строк; "
    "без воды и общих фраз («активно развивается», «успешно реализуется»); "
    "цифры писать точно, без «около» и «примерно» — если данных нет, писать [данные]"
)


def get_company_context(db: Session, company_id: int | None = None) -> str:
    """Build a company context string to inject into AI generation prompts."""
    q = db.query(CompanyProfile)
    if company_id is not None:
        q = q.filter(CompanyProfile.company_id == company_id)
    profile = q.first()

    parts = []

    if profile:
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
        if profile.language and profile.language != "ru":
            parts.append(f"Язык генерации: {profile.language}")

    # Base rules always apply; org-specific rules are appended on top
    org_rules = profile.writing_rules if profile and profile.writing_rules else None
    combined_rules = BASE_WRITING_RULES + (f"; {org_rules}" if org_rules else "")
    parts.append(f"Правила написания текста в слайдах: {combined_rules}")

    if profile and profile.forbidden_words:
        parts.append(f"ЗАПРЕЩЕНО использовать эти слова и фразы: {profile.forbidden_words}")

    return "### Контекст организации (следуй строго)\n" + "\n".join(parts)
