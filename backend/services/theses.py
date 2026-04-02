"""
Theses (Talking Points) Generation Service.

Flow:
  1. analyze_slides()  — GPT-4o looks at the presentation, returns 2-3 clarifying questions
                         so the speaker can give context (audience, goal, tone).
  2. generate_theses() — GPT-4o vision analyzes each slide thumbnail + metadata and produces
                         concise official-business talking points in KK / RU / EN.

Style: официально-деловой, простые слова, без тяжёлых канцеляризмов.
"""
import asyncio
import base64
import io
import json
import logging
from pathlib import Path
from typing import Optional

from openai import AsyncOpenAI
from sqlalchemy.orm import Session

from config import settings
from models.assembly import AssembledPresentation
from models.slide import SlideLibraryEntry
from models.theses import AssemblyTheses

logger = logging.getLogger(__name__)

# ── Prompts ───────────────────────────────────────────────────────────────────

ANALYZE_SYSTEM = """Ты — помощник по подготовке деловых выступлений.
Тебе дан список слайдов презентации (названия и краткие описания).
Задача: задать 2-3 уточняющих вопроса, которые помогут составить более точные тезисы.

Вопросы должны касаться:
- аудитории (кто слушает?)
- цели выступления
- акцентов (что особо подчеркнуть?)

Верни строго JSON:
{
  "questions": [
    {"id": "audience", "text": "Кто будет слушать выступление?"},
    {"id": "goal",     "text": "Какова главная цель вашего выступления?"},
    {"id": "emphasis", "text": "Есть ли темы или слайды, которые нужно выделить особо?"}
  ]
}

Ответь ТОЛЬКО JSON без пояснений."""

GENERATE_SYSTEM = """Ты — профессиональный бизнес-спичрайтер. Составляешь тезисы для выступления к каждому слайду презентации.

Требования к тезисам:
- Стиль: официально-деловой, но живой — без тяжёлых канцеляризмов
- Простые, понятные слова
- 3-5 тезисов на слайд (каждый — одно законченное предложение)
- Тезисы — то, что спикер ГОВОРИТ вслух, а не описание слайда
- Переведи тезисы на казахский (kk), русский (ru) и английский (en)

{context_block}

Верни строго JSON:
{{
  "slide_id_здесь": {{
    "ru": ["Тезис 1", "Тезис 2", "Тезис 3"],
    "kk": ["Тезис 1 на казахском", ...],
    "en": ["Thesis 1 in English", ...]
  }},
  ...
}}

Используй реальные slide_id из запроса. Ответь ТОЛЬКО JSON."""


def _context_block(context: dict) -> str:
    if not context:
        return ""
    lines = ["Контекст выступления:"]
    labels = {
        "audience": "Аудитория",
        "goal": "Цель",
        "emphasis": "Акценты",
    }
    for k, v in context.items():
        if v and str(v).strip():
            label = labels.get(k, k)
            lines.append(f"- {label}: {v}")
    return "\n".join(lines) if len(lines) > 1 else ""


def _get_client() -> AsyncOpenAI:
    kwargs: dict = {"api_key": settings.openai_api_key}
    if settings.openai_base_url:
        kwargs["base_url"] = settings.openai_base_url
    return AsyncOpenAI(**kwargs)


def _resize_thumbnail(img_bytes: bytes, max_width: int = 768) -> bytes:
    from PIL import Image
    img = Image.open(io.BytesIO(img_bytes))
    if img.width > max_width:
        ratio = max_width / img.width
        img = img.resize((max_width, int(img.height * ratio)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=80)
    return buf.getvalue()


def _thumb_b64(slide: SlideLibraryEntry) -> Optional[str]:
    """Read slide thumbnail and return base64 JPEG string, or None."""
    if not slide.thumbnail_path:
        return None
    path = Path(settings.thumbnail_dir) / slide.thumbnail_path
    if not path.exists():
        return None
    try:
        raw = path.read_bytes()
        small = _resize_thumbnail(raw)
        return base64.b64encode(small).decode()
    except Exception:
        return None


# ── Public API ────────────────────────────────────────────────────────────────

async def analyze_slides(db: Session, assembly_id: int) -> dict:
    """
    Analyze the presentation and return 2-3 clarifying questions.
    Returns {"questions": [{"id": "...", "text": "..."}, ...]}.
    """
    assembly = db.query(AssembledPresentation).get(assembly_id)
    if not assembly:
        raise ValueError(f"Assembly {assembly_id} not found")

    slide_ids: list[int] = json.loads(assembly.slide_ids_json or "[]")
    slides = [s for sid in slide_ids if (s := db.query(SlideLibraryEntry).get(sid))]

    # Build slide list for the prompt
    lines = [f"Презентация: «{assembly.title}»", f"Всего слайдов: {len(slides)}", ""]
    for i, s in enumerate(slides, 1):
        title = s.title or f"Слайд {i}"
        summary = s.summary or ""
        lines.append(f"{i}. {title}" + (f" — {summary}" if summary else ""))

    user_msg = "\n".join(lines)

    client = _get_client()
    try:
        resp = await client.chat.completions.create(
            model=settings.assembly_model,
            messages=[
                {"role": "system", "content": ANALYZE_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.3,
            response_format={"type": "json_object"},
        )
        raw = resp.choices[0].message.content or "{}"
        return json.loads(raw)
    except Exception as e:
        logger.warning(f"analyze_slides failed: {e}")
        # Return default questions on failure
        return {
            "questions": [
                {"id": "audience", "text": "Кто будет слушать выступление?"},
                {"id": "goal",     "text": "Какова главная цель вашего выступления?"},
                {"id": "emphasis", "text": "Есть ли темы, которые нужно выделить особо?"},
            ]
        }


async def generate_theses(
    db: Session,
    assembly_id: int,
    context: Optional[dict] = None,
) -> dict:
    """
    Generate talking-point theses per slide in KK/RU/EN.
    Saves result to AssemblyTheses. Returns theses dict.
    """
    assembly = db.query(AssembledPresentation).get(assembly_id)
    if not assembly:
        raise ValueError(f"Assembly {assembly_id} not found")

    context = context or {}
    slide_ids: list[int] = json.loads(assembly.slide_ids_json or "[]")
    slides = [s for sid in slide_ids if (s := db.query(SlideLibraryEntry).get(sid))]
    if not slides:
        raise ValueError("Презентация не содержит слайдов")

    system_prompt = GENERATE_SYSTEM.format(context_block=_context_block(context))

    # Build user message: slide descriptions + images
    user_content: list = []

    slide_info_lines = [f"Презентация: «{assembly.title}»\n"]
    for s in slides:
        tags = json.loads(s.tags_json or "[]")
        slide_info_lines.append(
            f"slide_id={s.id}: «{s.title or '(без названия)'}» | "
            f"Тип: {s.layout_type or '?'} | "
            f"Теги: {', '.join(tags) if tags else '—'} | "
            f"{(s.summary or '')[:120]}"
        )

    user_content.append({"type": "text", "text": "\n".join(slide_info_lines)})

    # Add thumbnail images for visual context (up to 12 slides to stay within token limits)
    for s in slides[:12]:
        b64 = _thumb_b64(s)
        if b64:
            user_content.append({
                "type": "text",
                "text": f"Слайд {s.id} — «{s.title or '?'}»:"
            })
            user_content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{b64}",
                    "detail": "low",
                }
            })

    client = _get_client()
    try:
        resp = await client.chat.completions.create(
            model=settings.assembly_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.4,
            response_format={"type": "json_object"},
            max_tokens=4000,
        )
        raw = resp.choices[0].message.content or "{}"
        theses = json.loads(raw)
    except Exception as e:
        logger.error(f"generate_theses failed: {e}")
        raise

    # Persist to DB (upsert)
    existing = db.query(AssemblyTheses).filter_by(assembly_id=assembly_id).first()
    if existing:
        existing.theses_json = json.dumps(theses, ensure_ascii=False)
        existing.context_json = json.dumps(context, ensure_ascii=False)
        from datetime import datetime, timezone
        existing.updated_at = datetime.now(timezone.utc)
    else:
        record = AssemblyTheses(
            assembly_id=assembly_id,
            theses_json=json.dumps(theses, ensure_ascii=False),
            context_json=json.dumps(context, ensure_ascii=False),
        )
        db.add(record)
    db.commit()

    return theses


def get_saved_theses(db: Session, assembly_id: int) -> Optional[dict]:
    """Return previously generated theses for assembly, or None."""
    record = db.query(AssemblyTheses).filter_by(assembly_id=assembly_id).first()
    if not record:
        return None
    return {
        "theses": json.loads(record.theses_json or "{}"),
        "context": json.loads(record.context_json or "{}"),
        "updated_at": record.updated_at.isoformat() if record.updated_at else None,
    }
