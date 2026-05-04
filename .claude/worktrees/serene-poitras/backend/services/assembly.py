"""
AI Assembly Pipeline.
Flow: prompt → embed → hybrid search (vector + keyword + MMR) → GPT-4o structured select → AssembledPresentation
"""
import json
import logging
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

ASSEMBLY_SYSTEM_PROMPT = """Ты — интеллектуальный ассистент по сборке презентаций.
Тебе дан запрос пользователя и список слайдов-кандидатов из библиотеки с оценками релевантности.
Твоя задача: выбрать лучшие слайды и структурировать их в логичную презентацию.

Правила выбора:
1. Включай только слайды, которые реально соответствуют запросу. Лучше меньше — но точнее.
2. НЕ включай дублирующиеся по смыслу слайды (даже если у них разные ID).
3. Максимум 1 слайд типа "title" (заставка). Максимум 1 слайд типа "section" в конце (контакты).
4. Старайся сохранять языковую консистентность (не мешай ru/en/kk без необходимости).
5. Не превышай максимальное количество слайдов, указанное в запросе.
6. Используй ТОЛЬКО идентификаторы из предоставленного списка.

Структура презентации (распредели слайды по секциям):
- "intro": вступление (1-2 слайда: заставка, контекст)
- "body": основная часть (большинство слайдов)
- "conclusion": заключение (1-2 слайда: итоги, следующие шаги, контакты)

Формат ответа — строго JSON без дополнительного текста:
{
  "title": "Название презентации (до 80 символов, на языке запроса)",
  "sections": {
    "intro": [id1, id2],
    "body": [id3, id4, id5, id6],
    "conclusion": [id7]
  },
  "rationale": "Краткое объяснение логики сборки (2-3 предложения)"
}"""


def _format_candidates(candidates: list[tuple[SlideLibraryEntry, float]]) -> str:
    """Format slide candidates for GPT context with enriched metadata."""
    lines = []
    for slide, score in candidates:
        tags = json.loads(slide.tags_json or "[]")
        tags_str = ", ".join(tags) if tags else "—"
        key_msg = (slide.key_message or "")[:120]
        summary = (slide.summary or "")[:150]
        content_hint = key_msg if key_msg else summary
        lines.append(
            f"ID={slide.id} | {slide.title or '(без названия)'} | "
            f"Тип: {slide.layout_type or '?'} | Тема: {slide.topic or '?'} | "
            f"Язык: {slide.language or '?'} | Релевантность: {score:.2f} | "
            f"Суть: {content_hint} | Теги: {tags_str}"
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
) -> AssembledPresentation:
    """
    Full assembly pipeline: embed → hybrid search → GPT select → store.
    Returns saved AssembledPresentation.
    """
    # 1. Embed the prompt
    query_embedding = await embed_single(prompt)

    # 2. Hybrid search: vector + keyword + MMR diversity reranking
    candidates = hybrid_search(
        db,
        query_embedding=query_embedding,
        query_text=prompt,
        top_k=min(50, max_slides * 4),
        user_id=user_id,
        mmr_lambda=0.7,
    )

    if not candidates:
        # Empty library
        assembly = AssembledPresentation(
            owner_id=user_id,
            title="Новая презентация",
            prompt=prompt,
            slide_ids_json="[]",
        )
        db.add(assembly)
        db.commit()
        db.refresh(assembly)
        return assembly

    # 3. GPT-4o selection and structuring
    client = get_client()
    candidates_text = _format_candidates(candidates[:60])

    try:
        response = await client.chat.completions.create(
            model=settings.assembly_model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": ASSEMBLY_SYSTEM_PROMPT},
                {"role": "user", "content": (
                    f"Запрос: {prompt}\n\n"
                    f"Максимум слайдов: {max_slides}\n\n"
                    f"Слайды-кандидаты:\n{candidates_text}"
                )},
            ],
            temperature=0.2,
        )
        raw = response.choices[0].message.content or "{}"
        result = json.loads(raw)
    except Exception as e:
        logger.error(f"GPT-4o assembly failed: {e}")
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
        # Fallback: GPT returned selected_ids directly (old format compat)
        selected_ids = [int(i) for i in result.get("selected_ids", []) if str(i).isdigit()]

    # Validate: keep only IDs present in our candidate set
    valid_ids = {slide.id for slide, _ in candidates}
    selected_ids = [sid for sid in selected_ids if sid in valid_ids][:max_slides]

    # Deduplicate while preserving order
    seen: set[int] = set()
    selected_ids = [sid for sid in selected_ids if not (sid in seen or seen.add(sid))]  # type: ignore[func-returns-value]

    # Contact slide: append if requested and not already included
    if user_id is not None:
        profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        if profile and profile.contact_slide_id:
            contact_kws = ("контакт", "contact", "байланыс", "связь", "reach")
            if (
                any(kw in prompt.lower() for kw in contact_kws)
                and profile.contact_slide_id not in selected_ids
            ):
                selected_ids.append(profile.contact_slide_id)

    assembly = AssembledPresentation(
        owner_id=user_id,
        title=title[:200],
        prompt=prompt,
        slide_ids_json=json.dumps(selected_ids),
    )
    db.add(assembly)
    db.commit()
    db.refresh(assembly)
    return assembly
