"""
Template Generator — uses LLM to plan and fill slide templates.

Flow:
  user prompt → LLM → [{template_id, slots}, ...] → TemplateInjector → PPTX
"""
import json
import logging
from pathlib import Path

from openai import AsyncOpenAI

from config import settings
from services.template_library import load_catalog, TemplateInfo

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


def _build_catalog_description(catalog: list[TemplateInfo]) -> str:
    lines = []
    for t in catalog:
        slot_list = "\n".join(f"      - {k}: {v}" for k, v in t.slots.items())
        lines.append(
            f'  id: "{t.id}"\n'
            f'  name: {t.name}\n'
            f'  use when: {", ".join(t.scenario_tags[:5])}\n'
            f'  slots:\n{slot_list}'
        )
    return "\n\n".join(lines)


SYSTEM_PROMPT_TEMPLATE = """Ты — генератор слайдов для презентаций. Твоя задача: по описанию пользователя составить план презентации и заполнить слоты каждого слайда конкретным контентом.

Доступные шаблоны слайдов:
{catalog}

Правила:
1. Выбирай шаблон исходя из смысла слайда — сопоставляй с полем "use when"
2. Заполняй ВСЕ слоты выбранного шаблона. Не пропускай ни один.
3. Для слотов с форматом "Значение\\nПодпись" — первая строка это цифра/заголовок, вторая — пояснение
4. Для слотов с форматом "Название\\n\\nОписание" — две строки разделены пустой строкой (двойной \\n)
5. Текст должен быть лаконичным — как в реальных презентациях
6. Ответ строго в JSON, без дополнительного текста

Формат ответа:
{{
  "title": "Название презентации",
  "slides": [
    {{
      "template_id": "id_шаблона",
      "slots": {{
        "slot_name": "контент",
        ...
      }}
    }}
  ]
}}"""


async def generate_presentation_plan(
    prompt: str,
    num_slides: int = 5,
) -> dict:
    """
    Ask LLM to create a presentation plan: list of slides with template_id + filled slots.

    Returns dict with keys: title, slides (list of {template_id, slots})
    """
    catalog = load_catalog()
    catalog_description = _build_catalog_description(catalog)
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(catalog=catalog_description)

    user_message = (
        f"Создай презентацию на тему:\n{prompt}\n\n"
        f"Количество слайдов: {num_slides}\n"
        f"Заполни все слоты каждого слайда реальным контентом по теме."
    )

    client = _get_client()
    try:
        response = await client.chat.completions.create(
            model=settings.assembly_model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0.3,
        )
        raw = response.choices[0].message.content or "{}"
        result = json.loads(raw)
        logger.info("Generated plan: %d slides for prompt %r", len(result.get("slides", [])), prompt[:60])
        return result
    except Exception as e:
        logger.error("LLM generation failed: %s", e)
        raise


async def fill_single_slide(
    slide_description: str,
    template_id: str | None = None,
) -> dict:
    """
    Generate content for a single slide.
    If template_id is None, LLM picks the best template.

    Returns {template_id, slots}
    """
    catalog = load_catalog()
    catalog_description = _build_catalog_description(catalog)
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(catalog=catalog_description)

    if template_id:
        tmpl_hint = f'Используй шаблон с id="{template_id}".'
    else:
        tmpl_hint = "Выбери наиболее подходящий шаблон."

    user_message = (
        f"Создай ОДИН слайд:\n{slide_description}\n\n"
        f"{tmpl_hint}\n"
        f"Верни JSON с одним слайдом:\n"
        f'{{"title": "...", "slides": [{{"template_id": "...", "slots": {{...}}}}]}}'
    )

    client = _get_client()
    response = await client.chat.completions.create(
        model=settings.assembly_model,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        temperature=0.3,
    )
    raw = response.choices[0].message.content or "{}"
    result = json.loads(raw)
    slides = result.get("slides", [])
    if not slides:
        raise ValueError("LLM returned no slides")
    return slides[0]
