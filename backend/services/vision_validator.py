"""
Vision Validator — GPT-4o Vision post-render quality check.

Flow:
  1. Receive rendered PNG thumbnail path + original blueprint + BrandColors
  2. Encode PNG as base64, send to GPT-4o Vision
  3. Vision checks layout issues WITHOUT touching brand constraints
  4. Returns (ok: bool, fixed_blueprint: dict | None)

What Vision checks:
  - Text visibly cut off / overflowing outside slide boundaries
  - Overlapping text boxes making content unreadable
  - Content too dense for the chosen layout
  - On dark/image backgrounds: text visible enough to read

What Vision NEVER touches:
  - Background image, shape colors, opacity  ← controlled by BrandColors
  - Font family, title/body font colors      ← fixed by brand template
  - Decorative elements (header bar, circles, accent lines)
  - Layout type choice (icon_grid vs process_flow etc.)

If issues are found, Vision returns a structurally fixed blueprint with
shortened text / fewer items — same layout, same colors, just less content.
"""

from __future__ import annotations

import base64
import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING

from openai import AsyncOpenAI

from config import settings

if TYPE_CHECKING:
    from services.slide_generator import BrandColors

logger = logging.getLogger(__name__)

# ─── Prompt ───────────────────────────────────────────────────────────────────

_SYSTEM = """You are a slide layout quality inspector. Your job is to look at a rendered presentation slide and decide whether the content fits properly within the slide boundaries.

STRICT SCOPE — you may ONLY flag and fix:
1. Text that is visibly cut off or overflows outside the slide edge
2. Text boxes that overlap each other making content unreadable
3. A list that has too many items and the last ones are cut off or missing
4. On dark/image backgrounds: text that blends into the background and cannot be read

DO NOT flag or suggest changes to:
- Colors, fonts, opacity, or background (these are locked brand guidelines)
- Decorative shapes, header bars, circles, accent lines
- The choice of layout type (e.g. do not suggest switching icon_grid to title_content)
- Minor aesthetic preferences

RESPONSE FORMAT — strict JSON, no markdown:

If the slide looks acceptable:
{"ok": true}

If there are fixable problems:
{
  "ok": false,
  "issues": ["brief description of each problem"],
  "fixed_blueprint": { ...same JSON structure as the input blueprint, with only text shortened or list items removed... }
}

When writing fixed_blueprint: preserve the exact same layout and all structural keys.
Only shorten strings or remove excess list items. Do not invent new content."""


def _build_brand_context(colors: "BrandColors") -> str:
    """Summarise brand constraints so Vision doesn't suggest forbidden changes."""
    has_bg = bool(colors.background_image_path)
    bg_desc = "custom image background (may be dark)" if has_bg else "plain white background"
    return (
        f"Brand context: {bg_desc}. "
        f"Title font: {colors.font_family} {colors.title_font_size}pt color=#{colors.title_font_color}. "
        f"Body font: {colors.font_family} {colors.body_font_size}pt color=#{colors.body_font_color}. "
        f"Shape color=#{colors.shape_color} opacity={colors.shape_opacity}%. "
        "These are fixed brand values — do not suggest changing them."
    )


def _get_client() -> AsyncOpenAI:
    kwargs: dict = {"api_key": settings.openai_api_key}
    if settings.openai_base_url:
        kwargs["base_url"] = settings.openai_base_url
    return AsyncOpenAI(**kwargs)


# ─── Main entry ───────────────────────────────────────────────────────────────

async def vision_validate(
    thumbnail_path: str,
    blueprint: dict,
    colors: "BrandColors",
) -> tuple[bool, dict | None]:
    """
    Send the rendered thumbnail to GPT-4o Vision for a layout quality check.

    Returns:
        (True, None)            — slide is fine, proceed as-is
        (False, fixed_blueprint) — issues found; re-render with fixed_blueprint
        (True, None)            — on any API/parse error (fail open to avoid blocking)
    """
    if not settings.vision_model:
        return True, None  # Vision disabled in config

    png = Path(thumbnail_path)
    if not png.exists():
        logger.warning(f"vision_validate: thumbnail not found at {thumbnail_path}")
        return True, None

    try:
        img_b64 = base64.standard_b64encode(png.read_bytes()).decode()
    except Exception as e:
        logger.warning(f"vision_validate: failed to read thumbnail: {e}")
        return True, None

    brand_ctx   = _build_brand_context(colors)
    blueprint_s = json.dumps(blueprint, ensure_ascii=False)

    user_msg = (
        f"{brand_ctx}\n\n"
        f"Blueprint used to generate this slide:\n{blueprint_s}\n\n"
        "Inspect the slide image and report any layout issues."
    )

    try:
        client = _get_client()
        resp = await client.chat.completions.create(
            model=settings.vision_model,
            max_tokens=800,
            messages=[
                {"role": "system", "content": _SYSTEM},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url":    f"data:image/png;base64,{img_b64}",
                                "detail": "high",
                            },
                        },
                        {"type": "text", "text": user_msg},
                    ],
                },
            ],
        )
    except Exception as e:
        logger.warning(f"vision_validate: API call failed: {e}")
        return True, None  # fail open

    raw = (resp.choices[0].message.content or "{}").strip()

    # Strip markdown fences if model added them
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rsplit("```", 1)[0]

    try:
        result = json.loads(raw.strip())
    except json.JSONDecodeError as e:
        logger.warning(f"vision_validate: JSON parse failed ({e}): {raw[:200]}")
        return True, None  # fail open

    ok: bool = bool(result.get("ok", True))
    issues: list[str] = result.get("issues", [])
    fixed: dict | None = result.get("fixed_blueprint")

    if not ok and issues:
        logger.info(f"vision_validate: issues found — {issues}")

    if not ok and not fixed:
        # Vision flagged issues but didn't provide a fix — treat as ok to avoid loops
        logger.warning("vision_validate: ok=False but no fixed_blueprint provided; skipping re-render")
        return True, None

    return ok, fixed if not ok else None
