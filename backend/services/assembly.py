"""
AI Assembly Pipeline.
Flow: prompt → embed → hybrid search (vector + keyword + MMR) → GPT-4o structured select → AssembledPresentation
"""
import json
import logging
import re
from typing import Optional

from openai import AsyncOpenAI
from sqlalchemy.orm import Session

from config import settings
from models.slide import SlideLibraryEntry
from models.assembly import AssembledPresentation
from models.user import UserProfile
from services.embedding import embed_single, get_client
from services.vector_search import hybrid_search

logger = logging.getLogger(__name__)

ASSEMBLY_SYSTEM_PROMPT = """Ты — интеллектуальный ассистент по сборке корпоративных презентаций.
Тебе дан запрос пользователя, контекст организации и список слайдов-кандидатов из библиотеки с оценками релевантности.
Твоя задача: выбрать лучшие слайды и структурировать их в логичную, профессиональную презентацию.

ПРАВИЛА ВЫБОРА:
1. Включай только слайды, которые реально соответствуют запросу. Лучше меньше — но точнее.
2. НЕ включай дублирующиеся по смыслу слайды (даже если у них разные ID).
3. Максимум 1 слайд типа "title" (только в начале). Максимум 1 слайд типа "section" (контакты — только в конце).
4. ОБЯЗАТЕЛЬНО соблюдай языковую консистентность: если запрос на русском — выбирай русскоязычные слайды, на казахском — казахскоязычные. Не смешивай языки без крайней необходимости.
5. Не превышай максимальное количество слайдов.
6. Используй ТОЛЬКО идентификаторы из предоставленного списка — не придумывай новые.
7. Учитывай логику повествования: от общего к частному, от проблемы к решению, от контекста к деталям.
8. Если в запросе указана аудитория или цель — подбирай слайды соответствующего уровня детализации.

СТРУКТУРА (распредели слайды по секциям):
- "intro": вступление (1-2 слайда: заставка, контекст, постановка задачи)
- "body": основная часть (большинство слайдов, логически упорядоченных)
- "conclusion": заключение (1-2 слайда: итоги, следующие шаги, контакты)

ФОРМАТ ОТВЕТА — строго JSON без дополнительного текста:
{
  "title": "Название презентации (до 80 символов, на языке запроса)",
  "sections": {
    "intro": [id1, id2],
    "body": [id3, id4, id5, id6],
    "conclusion": [id7]
  },
  "rationale": "Краткое объяснение логики сборки (2-3 предложения)"
}"""


def _detect_language(text: str) -> str:
    """Detect dominant script in text: ru, kk (cyrillic), or en."""
    cyrillic = len(re.findall(r'[а-яёА-ЯЁәіңғүұқөһӘІҢҒҮҰҚӨҺ]', text))
    latin = len(re.findall(r'[a-zA-Z]', text))
    if cyrillic == 0 and latin == 0:
        return "ru"
    return "ru" if cyrillic >= latin else "en"


def _build_context_block(
    prompt: str,
    org_profile: object | None,
    user_profile: object | None,
) -> str:
    """Build context block injected into the user message."""
    parts = []

    lang = _detect_language(prompt)
    parts.append(f"Язык запроса: {'русский' if lang == 'ru' else 'английский'}")

    if org_profile:
        if getattr(org_profile, "org_name", None):
            parts.append(f"Организация: {org_profile.org_name}")
        if getattr(org_profile, "mission", None):
            parts.append(f"Миссия: {org_profile.mission[:200]}")
        if getattr(org_profile, "key_products", None):
            parts.append(f"Ключевые продукты/направления: {org_profile.key_products[:200]}")
        if getattr(org_profile, "strategic_priorities", None):
            parts.append(f"Стратегические приоритеты: {org_profile.strategic_priorities[:200]}")
        if getattr(org_profile, "writing_rules", None):
            parts.append(f"Стиль подачи: {org_profile.writing_rules[:150]}")

    if user_profile:
        preferred = json.loads(getattr(user_profile, "preferred_tags_json", None) or
                               json.dumps(getattr(user_profile, "preferred_tags", None) or []))
        if preferred:
            parts.append(f"Приоритетные темы пользователя: {', '.join(preferred[:8])}")
        ai_style = getattr(user_profile, "ai_style", None)
        if ai_style == "official":
            parts.append("Стиль: официальный, строгий")
        elif ai_style == "casual":
            parts.append("Стиль: разговорный, неформальный")

    return "\n".join(parts)


def _format_candidates(candidates: list[tuple[SlideLibraryEntry, float]]) -> str:
    """Format slide candidates for GPT context with enriched metadata."""
    lines = []
    for slide, score in candidates:
        tags = json.loads(slide.tags_json or "[]")
        tags_str = ", ".join(tags) if tags else "—"
        key_msg = (slide.key_message or "")[:140]
        summary = (slide.summary or "")[:160]
        content_hint = key_msg if key_msg else summary

        # Include source filename hint so GPT understands provenance
        source_hint = ""
        if slide.source and slide.source.filename:
            source_hint = f" | Источник: {slide.source.filename[:50]}"

        lines.append(
            f"ID={slide.id} | {slide.title or '(без названия)'} | "
            f"Тип: {slide.layout_type or '?'} | Тема: {slide.topic or '?'} | "
            f"Язык: {slide.language or '?'} | Релевантность: {score:.2f} | "
            f"Суть: {content_hint} | Теги: {tags_str}{source_hint}"
        )
    return "\n".join(lines)


def _flatten_sections(sections: dict) -> list[int]:
    """Flatten sections dict to ordered list of IDs: intro → body → conclusion."""
    result = []
    for section_key in ("intro", "body", "conclusion"):
        ids = sections.get(section_key, [])
        if isinstance(ids, list):
            result.extend(int(i) for i in ids if isinstance(i, (int, float, str)) and str(i).isdigit())
    return result


async def run_assembly(
    db: Session,
    prompt: str,
    max_slides: int = 15,
    user_id: int | None = None,
    company_id: int | None = None,
) -> AssembledPresentation:
    """
    Full assembly pipeline: embed → hybrid search → GPT select → store.
    Returns saved AssembledPresentation.
    """
    # 1. Embed the prompt
    query_embedding = await embed_single(prompt)

    # 2. Hybrid search across company library (or user library as fallback)
    candidates = hybrid_search(
        db,
        query_embedding=query_embedding,
        query_text=prompt,
        top_k=min(50, max_slides * 4),
        user_id=user_id if not company_id else None,
        company_id=company_id,
        mmr_lambda=0.7,
    )

    if not candidates:
        assembly = AssembledPresentation(
            owner_id=user_id,
            company_id=company_id,
            title="Новая презентация",
            prompt=prompt,
            slide_ids_json="[]",
        )
        db.add(assembly)
        db.commit()
        db.refresh(assembly)
        return assembly

    # 3. Load context: org profile + user profile
    org_profile = None
    user_profile = None
    try:
        from models.org_profile import OrgProfile
        if company_id:
            org_profile = db.query(OrgProfile).filter(OrgProfile.company_id == company_id).first()
        elif user_id:
            org_profile = db.query(OrgProfile).filter(OrgProfile.owner_id == user_id).first()
    except Exception:
        pass

    if user_id:
        user_profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()

    # 4. Build context block and GPT messages
    context_block = _build_context_block(prompt, org_profile, user_profile)
    candidates_text = _format_candidates(candidates[:60])

    user_message = (
        f"Запрос: {prompt}\n\n"
        f"Максимум слайдов: {max_slides}\n\n"
    )
    if context_block:
        user_message += f"Контекст организации:\n{context_block}\n\n"
    user_message += f"Слайды-кандидаты ({len(candidates)} шт.):\n{candidates_text}"

    # 5. GPT-4o selection and structuring
    client = get_client()

    try:
        response = await client.chat.completions.create(
            model=settings.assembly_model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": ASSEMBLY_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            temperature=0.2,
        )
        raw = response.choices[0].message.content or "{}"
        result = json.loads(raw)
    except Exception as e:
        logger.error(f"GPT assembly failed: {e}")
        result = {
            "title": "Презентация",
            "sections": {"intro": [], "body": [s.id for s, _ in candidates[:max_slides]], "conclusion": []},
            "rationale": "Автоматический выбор по релевантности.",
        }

    title: str = result.get("title", "Новая презентация")

    # Flatten sections to ordered list
    sections = result.get("sections", {})
    if sections:
        selected_ids = _flatten_sections(sections)
    else:
        selected_ids = [int(i) for i in result.get("selected_ids", []) if str(i).isdigit()]

    # Validate: keep only IDs present in our candidate set
    valid_ids = {slide.id for slide, _ in candidates}
    selected_ids = [sid for sid in selected_ids if sid in valid_ids][:max_slides]

    # Deduplicate while preserving order
    seen: set[int] = set()
    selected_ids = [sid for sid in selected_ids if not (sid in seen or seen.add(sid))]  # type: ignore[func-returns-value]

    # Contact slide: append if requested and not already included
    if user_id is not None and user_profile and user_profile.contact_slide_id:
        contact_kws = ("контакт", "contact", "байланыс", "связь", "reach")
        if (
            any(kw in prompt.lower() for kw in contact_kws)
            and user_profile.contact_slide_id not in selected_ids
        ):
            selected_ids.append(user_profile.contact_slide_id)

    assembly = AssembledPresentation(
        owner_id=user_id,
        company_id=company_id,
        title=title[:200],
        prompt=prompt,
        slide_ids_json=json.dumps(selected_ids),
    )
    db.add(assembly)
    db.commit()
    db.refresh(assembly)
    return assembly
