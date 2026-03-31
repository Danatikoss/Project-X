"""
AI Assembly Pipeline.
Flow: prompt → embed → vector search candidates → GPT-4o select & order → AssembledPresentation
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
from services.vector_search import search_slides, keyword_search

logger = logging.getLogger(__name__)

ASSEMBLY_SYSTEM_PROMPT = """Ты — интеллектуальный ассистент по сборке презентаций.
Тебе дан запрос пользователя и список слайдов-кандидатов из библиотеки.
Твоя задача: выбрать наиболее подходящие слайды и выстроить их в логичную структуру презентации.

Правила:
1. Выбирай слайды, которые максимально соответствуют запросу.
2. Не включай дублирующиеся по смыслу слайды.
3. Упорядочи слайды в логичный нарратив (вступление → основная часть → заключение).
4. Максимальное количество слайдов указано в запросе.
5. Используй ТОЛЬКО идентификаторы из предоставленного списка.
6. Всегда отвечай строго в JSON-формате без дополнительного текста.

Формат ответа:
{
  "title": "Название презентации (до 80 символов)",
  "selected_ids": [id1, id2, id3, ...],
  "rationale": "Краткое объяснение логики сборки (2-3 предложения)"
}"""


def _format_candidates(candidates: list[tuple[SlideLibraryEntry, float]]) -> str:
    """Format slide candidates for GPT context."""
    lines = []
    for slide, score in candidates:
        tags = json.loads(slide.tags_json or "[]")
        tags_str = ", ".join(tags) if tags else "—"
        lines.append(
            f"ID={slide.id} | {slide.title or '(без названия)'} | "
            f"Тип: {slide.layout_type or '?'} | Теги: {tags_str} | "
            f"Совпадение: {score:.2f} | {(slide.summary or '')[:100]}"
        )
    return "\n".join(lines)


async def run_assembly(
    db: Session,
    prompt: str,
    max_slides: int = 15,
    user_id: int | None = None,
) -> AssembledPresentation:
    """
    Full assembly pipeline: embed → search → GPT select → store.
    Returns saved AssembledPresentation.
    """
    # 1. Embed the prompt
    query_embedding = await embed_single(prompt)

    # 2. Vector similarity search → top candidates
    vector_results = search_slides(db, query_embedding, top_k=min(50, max_slides * 5), user_id=user_id)

    # 3. Keyword fallback for short/acronym queries
    keyword_results = keyword_search(db, prompt, top_k=20, user_id=user_id)

    # Merge: vector results + keyword results, deduplicate by ID
    seen_ids: set[int] = set()
    merged: list[tuple[SlideLibraryEntry, float]] = []

    for slide, score in vector_results:
        if slide.id not in seen_ids:
            seen_ids.add(slide.id)
            merged.append((slide, score))

    for slide in keyword_results:
        if slide.id not in seen_ids:
            seen_ids.add(slide.id)
            merged.append((slide, 0.5))  # default score for keyword hits

    if not merged:
        # Empty library: create assembly with empty slides
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

    # 4. GPT-4o selection
    client = get_client()
    candidates_text = _format_candidates(merged[:60])  # limit context

    try:
        response = await client.chat.completions.create(
            model=settings.assembly_model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": ASSEMBLY_SYSTEM_PROMPT},
                {"role": "user", "content": (
                    f"Запрос пользователя: {prompt}\n\n"
                    f"Максимум слайдов: {max_slides}\n\n"
                    f"Доступные слайды:\n{candidates_text}"
                )},
            ],
            temperature=0.2,
        )
        raw = response.choices[0].message.content or "{}"
        result = json.loads(raw)
    except Exception as e:
        logger.error(f"GPT-4o assembly failed: {e}")
        # Fallback: take top-N by vector score
        result = {
            "title": "Презентация",
            "selected_ids": [s.id for s, _ in merged[:max_slides]],
            "rationale": "Автоматический выбор по релевантности.",
        }

    selected_ids: list[int] = result.get("selected_ids", [])
    title: str = result.get("title", "Новая презентация")

    # Validate: keep only IDs that actually exist in our candidates
    valid_ids = seen_ids
    selected_ids = [sid for sid in selected_ids if sid in valid_ids][:max_slides]

    # Check user's contact slide
    if user_id is not None:
        profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        if profile and profile.contact_slide_id and profile.contact_slide_id not in selected_ids:
            if "контакт" in prompt.lower() or "мои контакты" in prompt.lower():
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
