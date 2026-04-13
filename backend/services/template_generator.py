"""
Template Generator — uses LLM to plan and fill slide templates.

Flow (new):
  user prompt
    → Step 1 decompose: LLM returns [{intent, content}] — no template_ids
    → Step 2 match:     embed(intent+content) → cosine search → template
    → Step 3 fill:      LLM sees slot names + slide description → returns {slot: text}

LLM never sees the catalog, never returns template_id.
"""
import json
import logging
import numpy as np
from pathlib import Path

from openai import AsyncOpenAI

from config import settings
from services.template_library import load_catalog, get_content_catalog, TemplateInfo

logger = logging.getLogger(__name__)

_client = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        kwargs = {"api_key": settings.openai_api_key}
        if settings.openai_base_url:
            kwargs["base_url"] = settings.openai_base_url
        _client = AsyncOpenAI(**kwargs)
    return _client


# ── Step 1: decompose ─────────────────────────────────────────────────────────

DECOMPOSE_SYSTEM = """Ты — архитектор презентаций. Твоя задача: разбить тему на логичные слайды.

Правила:
1. Определи оптимальное число слайдов (обычно 3–8) исходя из темы
2. Для каждого слайда опиши: что он должен донести (intent) и какие конкретные данные/факты на нём (content)
3. НЕ придумывай шаблоны — только смысл и содержание
4. Ответ строго в JSON, без лишнего текста

Формат:
{
  "title": "Название всей презентации",
  "slides": [
    {
      "intent": "Что этот слайд должен донести до зрителя",
      "content": "Конкретные данные, факты, тезисы для этого слайда"
    }
  ]
}"""


async def _decompose_prompt(prompt: str) -> dict:
    """Step 1: ask LLM to break prompt into slide intents. Returns {title, slides:[{intent,content}]}"""
    client = _get_client()
    response = await client.chat.completions.create(
        model=settings.assembly_model,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": DECOMPOSE_SYSTEM},
            {"role": "user", "content": f"Тема презентации:\n{prompt}"},
        ],
        temperature=0.3,
    )
    raw = json.loads(response.choices[0].message.content or "{}")
    logger.info("Decomposed into %d slides: %r", len(raw.get("slides", [])), prompt[:60])
    return raw


# ── Step 2: match ─────────────────────────────────────────────────────────────

def _template_vector_search(
    query_embedding: list[float],
    catalog: list[TemplateInfo],
    top_k: int = 1,
) -> list[TemplateInfo]:
    """
    Find the most similar templates by cosine similarity against their stored embeddings.
    Skips templates with empty or zero embeddings.
    Returns up to top_k results, best match first.
    """
    candidates = [t for t in catalog if t.embedding and sum(abs(x) for x in t.embedding) > 1e-6]
    if not candidates:
        # No embeddings yet — fall back to returning all templates in original order
        logger.warning("No templates with valid embeddings — falling back to first template")
        return catalog[:top_k]

    q = np.array(query_embedding, dtype=np.float32)
    q_norm = np.linalg.norm(q)
    if q_norm < 1e-10:
        return candidates[:top_k]
    q = q / q_norm

    scored: list[tuple[TemplateInfo, float]] = []
    for tmpl in candidates:
        v = np.array(tmpl.embedding, dtype=np.float32)
        v_norm = np.linalg.norm(v)
        if v_norm < 1e-10:
            continue
        sim = float(np.dot(q, v / v_norm))
        scored.append((tmpl, sim))

    scored.sort(key=lambda x: x[1], reverse=True)
    return [t for t, _ in scored[:top_k]]


# ── Step 3: fill ──────────────────────────────────────────────────────────────

FILL_SYSTEM = """Ты — копирайтер для презентаций. Твоя задача: заполнить слоты слайда конкретным текстом.

Правила:
1. Заполняй ВСЕ слоты без исключения
2. Текст лаконичный — как в реальных презентациях, не эссе
3. Строго соблюдай формат каждого слота (указан в описании)
4. Ответ строго в JSON: {"slot_name": "текст", ...}
5. Используй \\n для переноса строки внутри значения, если формат требует"""


def _describe_slot_format(slot_name: str, hint: str) -> str:
    """
    Build a human-readable format description for one slot,
    based on the hint text from catalog.json.
    """
    # Hint from actual shape text — detect format
    if "\n\n" in hint:
        example = hint.replace("\n\n", "\\n\\n")
        return f'формат: ЗАГОЛОВОК\\n\\nОПИСАНИЕ (пустая строка между). Пример: "{example}"'
    if "\n" in hint:
        example = hint.replace("\n", "\\n")
        return f'формат: ЗНАЧЕНИЕ\\nПОДПИСЬ (перенос строки). Пример: "{example}"'

    # Infer from slot name if hint is generic
    name_lower = slot_name.lower()
    if any(x in name_lower for x in ("metric", "stat", "kpi", "number", "count", "rate")):
        return 'формат: ЗНАЧЕНИЕ\\nПОДПИСЬ. Пример: "750,000+\\nПользователей"'
    if any(x in name_lower for x in ("title", "header", "heading", "заголовок")):
        return "plain text, короткий заголовок (3–8 слов)"
    if any(x in name_lower for x in ("description", "body", "text", "desc", "subtitle")):
        return "plain text, 1–2 предложения"
    if any(x in name_lower for x in ("step", "шаг", "item", "point")):
        return 'формат: НАЗВАНИЕ\\n\\nОПИСАНИЕ. Пример: "Анализ данных\\n\\nСобираем и обрабатываем показатели"'

    return "plain text"


async def _fill_slots(
    intent: str,
    content: str,
    template: TemplateInfo,
) -> dict[str, str]:
    """Step 3: ask LLM to fill template slots for a specific slide intent."""
    slots_lines = []
    for slot_name, hint in template.slots.items():
        fmt = _describe_slot_format(slot_name, hint)
        slots_lines.append(f"  - {slot_name}: {fmt}")
    slots_block = "\n".join(slots_lines)

    user_msg = (
        f"Слайд должен показать: {intent}\n"
        f"Данные и факты: {content}\n\n"
        f"Слоты шаблона (соблюдай формат каждого):\n{slots_block}\n\n"
        f"Заполни все слоты. Верни только JSON: {{\"slot_name\": \"текст\", ...}}"
    )

    client = _get_client()
    response = await client.chat.completions.create(
        model=settings.assembly_model,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": FILL_SYSTEM},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.3,
    )
    raw = json.loads(response.choices[0].message.content or "{}")

    # Validate: ensure all expected slots present; fall back to hint if missing
    result: dict[str, str] = {}
    for slot_key, hint in template.slots.items():
        if slot_key in raw and str(raw[slot_key]).strip():
            result[slot_key] = str(raw[slot_key])
        else:
            logger.warning("LLM missing slot %r for template %r — using hint as fallback", slot_key, template.id)
            result[slot_key] = hint  # hint from catalog is better than "[slot_key]"
    return result


# ── Public API ────────────────────────────────────────────────────────────────

async def generate_presentation_plan(prompt: str, theme: str = "default") -> dict:
    """
    3-step pipeline: decompose → match → fill.
    Returns {title, slides: [{template_id, slots}]}
    """
    from services.embedding import embed_single

    full_catalog = load_catalog()
    catalog = get_content_catalog(theme=theme, catalog=full_catalog)
    if not catalog:
        catalog = get_content_catalog(theme="default", catalog=full_catalog)
    if not catalog:
        catalog = [t for t in full_catalog if t.layout_role == "content"]
    if not catalog:
        raise ValueError("Каталог шаблонов пуст. Загрузите шаблоны и нажмите Reindex.")

    # Step 1 — decompose
    decomposed = await _decompose_prompt(prompt)
    title = decomposed.get("title", "Презентация")
    slide_intents = decomposed.get("slides", [])

    if not slide_intents:
        raise ValueError("LLM returned no slide intents")

    result_slides = []
    for item in slide_intents:
        intent = item.get("intent", "")
        content = item.get("content", "")

        # Step 2 — match
        search_text = f"{intent} {content}".strip()
        try:
            query_emb = await embed_single(search_text)
            matches = _template_vector_search(query_emb, catalog, top_k=1)
            template = matches[0]
        except Exception as e:
            logger.warning("Vector search failed for intent %r: %s — using first template", intent[:50], e)
            template = catalog[0]

        # Step 3 — fill
        try:
            slots = await _fill_slots(intent, content, template)
        except Exception as e:
            logger.warning("Fill failed for template %r: %s", template.id, e)
            slots = {k: f"[{k}]" for k in template.slots}

        result_slides.append({"template_id": template.id, "slots": slots})
        logger.info("Slide: intent=%r → template=%r", intent[:40], template.id)

    logger.info("Generated plan: %d slides for prompt %r", len(result_slides), prompt[:60])
    return {"title": title, "slides": result_slides}


async def extract_file_content(file_bytes: bytes, filename: str) -> str:
    """
    Extract meaningful text from a PDF or DOCX file.
    Strips boilerplate/filler and returns a clean summary suitable for use as a prompt.
    """
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""

    raw_text = ""
    if ext == "pdf":
        import fitz  # PyMuPDF
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        pages = []
        for page in doc:
            pages.append(page.get_text())
        raw_text = "\n".join(pages)
    elif ext in ("docx", "doc"):
        from docx import Document
        import io as _io
        doc = Document(_io.BytesIO(file_bytes))
        raw_text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    else:
        raise ValueError(f"Неподдерживаемый формат файла: .{ext}. Используй PDF или DOCX.")

    if not raw_text.strip():
        raise ValueError("Файл не содержит текста")

    truncated = raw_text[:8000]
    if len(raw_text) > 8000:
        truncated += "\n[текст обрезан...]"

    client = _get_client()
    response = await client.chat.completions.create(
        model=settings.assembly_model,
        messages=[
            {
                "role": "system",
                "content": (
                    "Ты — аналитик документов. Извлеки из текста только ключевую информацию: "
                    "факты, цифры, названия, цели, результаты, программы. "
                    "Убери воду, вводные фразы, юридические формулировки. "
                    "Верни структурированный список ключевых фактов на языке документа. "
                    "Не более 500 слов."
                ),
            },
            {"role": "user", "content": f"Документ:\n{truncated}"},
        ],
        temperature=0.1,
    )
    summary = response.choices[0].message.content or raw_text[:1000]
    logger.info("Extracted %d chars from %r → %d char summary", len(raw_text), filename, len(summary))
    return summary


async def fill_single_slide(
    slide_description: str,
    template_id: str | None = None,
    theme: str = "default",
) -> dict:
    """
    Generate content for a single slide.
    If template_id is provided — use it directly.
    Otherwise find best template via vector search.
    Returns {template_id, slots}
    """
    from services.embedding import embed_single

    full_catalog = load_catalog()
    catalog = get_content_catalog(theme=theme, catalog=full_catalog)
    if not catalog:
        catalog = get_content_catalog(theme="default", catalog=full_catalog)
    if not catalog:
        catalog = [t for t in full_catalog if t.layout_role == "content"]

    if template_id:
        template = next((t for t in full_catalog if t.id == template_id), None)
        if template is None:
            logger.warning("Requested template_id %r not found — searching by embedding", template_id)
            template = None

    if not template_id or template is None:
        try:
            query_emb = await embed_single(slide_description)
            matches = _template_vector_search(query_emb, catalog, top_k=1)
            template = matches[0]
        except Exception:
            template = catalog[0]

    slots = await _fill_slots(slide_description, "", template)
    return {"template_id": template.id, "slots": slots}
