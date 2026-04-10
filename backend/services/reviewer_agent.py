"""
Reviewer Agent — post-planning QA pass over the full blueprint deck.

Single LLM call that reviews and fixes:
  1. Consecutive identical layouts → changes second to a better fit
  2. Brand tone violations → rewrites content to match tone_of_voice
  3. Prohibited content → removes/rewrites anything in prohibitions list
  4. Narrative flow → improves slide titles for logical story arc
  5. Layout choices vs available_layouts → replaces unsupported layouts

Never adds or removes slides — output MUST have exactly the same count as input.
On any failure, returns original blueprints unchanged (safe fallback).
"""

from __future__ import annotations

import json
import logging

from openai import AsyncOpenAI

from config import settings

logger = logging.getLogger(__name__)


_REVIEWER_SYSTEM = """\
You are a strict QA reviewer for AI-generated presentation blueprints.

INPUT: a JSON array of slide blueprints + brand context.
OUTPUT: the SAME array with fixes applied. ONLY a JSON array — no markdown, no explanations.

════════════════════════════════
FIXED RULES (apply all, no exceptions)
════════════════════════════════
1. SLIDE COUNT IS IMMUTABLE — output must have EXACTLY the same number of objects as input.
2. CONSECUTIVE LAYOUTS — if two adjacent slides share the same layout value, change the second
   slide's layout to a different layout from the available_layouts list. Adjust content to fit
   the new layout's structure.
3. BRAND TONE — if tone_of_voice is given, rewrite all text fields (title, content strings)
   to match that tone. Keep facts intact; only change voice/style.
4. PROHIBITIONS — if any slide text contains a prohibited topic, phrase, or style element,
   rewrite that specific text to remove the violation. Do not delete the slide.
5. NARRATIVE FLOW — slide titles should form a logical story arc (problem → analysis → solution
   → results → call to action). Fix vague, duplicate, or off-topic titles.
6. AVAILABLE LAYOUTS — if a slide uses a layout not in the available_layouts list, replace it
   with the closest available layout. Restructure content to match the new layout.
7. PRESERVE RICHNESS — never simplify dense content into fewer items. Keep all data.
8. JSON STRUCTURE — all original fields must remain present: layout, title, content,
   speaker_notes. Content sub-fields must match the layout's schema.

Layout JSON schemas (use when changing layout):
  icon_grid:       content = {"cards": [{"heading":"...", "text":"..."}]}  (3-4 cards)
  key_message:     content = {"message":"...", "subtext":"..."}
  process_flow:    content = {"steps": [{"label":"...", "desc":"..."}]}  (3-5 steps)
  chart_bar:       content = {"categories":["A","B"], "series":[{"name":"X","values":[1,2]}]}
  chart_pie:       content = {"slices": [{"label":"A","value":60}]}
  big_stat:        content = {"value":"...", "label":"...", "context":["..."]}
  two_column:      content = {"left":{"heading":"...","items":["..."]}, "right":{"heading":"...","items":["..."]}}
  comparison:      content = {"left":{"label":"...","items":["..."]}, "right":{"label":"...","items":["..."]}}
  timeline:        content = {"steps": [{"label":"...", "event":"..."}]}
  quote:           content = {"quote":"...", "attribution":"..."}
  section_divider: content = {"subtitle":"..."}
  title_content:   content = {"type":"bullets", "items":["..."]}
"""


def _get_client() -> AsyncOpenAI:
    kwargs: dict = {"api_key": settings.openai_api_key}
    if settings.openai_base_url:
        kwargs["base_url"] = settings.openai_base_url
    return AsyncOpenAI(**kwargs)


async def review_and_fix_blueprints(
    blueprints: list[dict],
    available_layouts: set[str],
    brand_context: dict | None = None,
    title: str = "",
) -> list[dict]:
    """
    Run a single LLM pass to QA and fix the full blueprint deck.

    Args:
        blueprints:        List of blueprint dicts from the planner.
        available_layouts: Set of layout names supported by the user's template.
        brand_context:     Dict with optional keys: tone_of_voice, target_audience,
                           prohibitions (str), brand_guidelines_text (str).
        title:             Presentation title for context.

    Returns:
        Fixed blueprints list. Falls back to originals on any error.
    """
    if not blueprints:
        return blueprints

    brand_context = brand_context or {}

    # Build brand context section
    brand_lines: list[str] = []
    if brand_context.get("tone_of_voice"):
        brand_lines.append(f"Tone of voice: {brand_context['tone_of_voice']}")
    if brand_context.get("target_audience"):
        brand_lines.append(f"Target audience: {brand_context['target_audience']}")
    if brand_context.get("prohibitions"):
        brand_lines.append(
            f"Prohibitions (must NOT appear in any slide text): {brand_context['prohibitions']}"
        )
    if brand_context.get("brand_guidelines_text"):
        brand_lines.append(f"Additional brand guidelines: {brand_context['brand_guidelines_text']}")

    brand_section = (
        "\n\nBRAND CONTEXT:\n" + "\n".join(brand_lines)
        if brand_lines
        else "\n\n(No brand context provided — focus on layout and flow fixes only.)"
    )

    user_msg = (
        f"Presentation title: {title}\n"
        f"Available layouts: {', '.join(sorted(available_layouts))}\n"
        f"{brand_section}\n\n"
        f"Blueprints to review and fix ({len(blueprints)} slides):\n"
        f"{json.dumps(blueprints, ensure_ascii=False)}"
    )

    client = _get_client()
    try:
        resp = await client.chat.completions.create(
            model=settings.generator_model,
            messages=[
                {"role": "system", "content": _REVIEWER_SYSTEM},
                {"role": "user",   "content": user_msg},
            ],
            temperature=0.2,
            max_tokens=7000,
        )

        raw = (resp.choices[0].message.content or "").strip()

        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.rsplit("```", 1)[0]

        fixed: list[dict] = json.loads(raw.strip())

        if not isinstance(fixed, list):
            raise ValueError("Reviewer returned non-list JSON")

        if len(fixed) != len(blueprints):
            logger.warning(
                f"Reviewer changed slide count {len(blueprints)} → {len(fixed)}, "
                "discarding reviewer output"
            )
            return blueprints

        logger.info(f"Reviewer pass complete: {len(fixed)} slides reviewed and fixed")
        return fixed

    except Exception as exc:
        logger.warning(f"Reviewer agent failed ({exc}), using original blueprints")
        return blueprints
