"""
Presentation Planner Service.

Flow:
  1. extract_text() — pull readable text from PPTX / PDF / DOCX / plain text
  2. plan_presentation() — AI analyses content → returns ordered list of slide blueprints
  3. render_presentation() — render each blueprint → merge into one PPTX file

The planner prompt enforces visual variety:
  - No text walls (max 5 bullets per slide)
  - Chooses icon_grid, chart_bar, key_message, process_flow instead of bullet lists
  - No two consecutive slides with the same layout
"""

import io
import json
import logging
import os
import tempfile
import uuid
from pathlib import Path

from openai import AsyncOpenAI
from pptx import Presentation
from pptx.util import Inches
from sqlalchemy.orm import Session

from config import settings

logger = logging.getLogger(__name__)

# ─── Text extraction ──────────────────────────────────────────────────────────

def extract_text_from_pptx(file_bytes: bytes) -> str:
    from pptx import Presentation as _Prs
    prs = _Prs(io.BytesIO(file_bytes))
    lines = []
    for i, slide in enumerate(prs.slides, 1):
        lines.append(f"\n--- Слайд {i} ---")
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    text = para.text.strip()
                    if text:
                        lines.append(text)
    return "\n".join(lines)


def extract_text_from_pdf(file_bytes: bytes) -> str:
    import fitz
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    lines = []
    for i, page in enumerate(doc, 1):
        text = page.get_text("text").strip()
        if not text:
            # Image-based page — try to extract text from embedded images via OCR blocks
            blocks = page.get_text("blocks")
            text = " ".join(b[4].strip() for b in blocks if b[4].strip())
        if text:
            lines.append(f"\n--- Страница {i} ---")
            lines.append(text)

    result = "\n".join(lines).strip()
    if not result:
        raise ValueError(
            "PDF не содержит извлекаемого текста. "
            "Это отсканированный документ — загрузите DOCX, TXT или PPTX, "
            "либо введите текст вручную."
        )


def extract_text_from_docx(file_bytes: bytes) -> str:
    from docx import Document
    doc = Document(io.BytesIO(file_bytes))
    return "\n".join(p.text.strip() for p in doc.paragraphs if p.text.strip())


def extract_text(file_bytes: bytes, file_ext: str) -> str:
    ext = file_ext.lower().lstrip(".")
    if ext == "pptx":
        return extract_text_from_pptx(file_bytes)
    elif ext == "pdf":
        return extract_text_from_pdf(file_bytes)
    elif ext == "docx":
        return extract_text_from_docx(file_bytes)
    else:
        return file_bytes.decode("utf-8", errors="replace")


# ─── Planning prompt ──────────────────────────────────────────────────────────

_PLAN_SYSTEM = """You are a world-class presentation designer creating visually stunning decks like Gamma and Kimi K2.

Your task: analyse the provided content and produce a complete slide deck as a JSON array of slide blueprints.

STRICT VISUAL RULES — NO EXCEPTIONS:
1. NEVER use title_content with more than 5 short bullets. If content is longer, split into multiple slides or use a different layout.
2. title_content is the LAST RESORT. Prefer visual layouts:
   • 3-4 concepts/features/benefits → icon_grid
   • Key insight or powerful statement → key_message
   • Sequential process (3-5 steps) → process_flow
   • 3+ comparable numbers → chart_bar
   • Proportions / market share → chart_pie
   • One big dramatic number → big_stat
   • Two sides of a story → comparison or two_column
   • Quote or testimonial → quote
   • Section transition → section_divider
3. Vary layouts — no two consecutive slides may use the same layout.
4. icon_grid cards: heading max 30 chars, text max 80 chars. No emoji fields needed.
5. process_flow steps: label max 25 chars, desc max 60 chars. No emoji fields needed.
6. key_message: the "message" field must be ≤15 words — punchy and impactful.

Slide count rules:
- Short document (< 500 words): 6-8 slides
- Medium document (500-2000 words): 8-12 slides
- Long document (> 2000 words): 12-16 slides
- Always start with a title/intro slide (section_divider or key_message)
- Always end with a closing slide (key_message, section_divider, or big_stat)

Available layouts:
icon_grid | key_message | process_flow | chart_bar | chart_pie | big_stat | two_column | comparison | timeline | quote | section_divider | title_content

JSON schema for each layout:

icon_grid:       {"layout":"icon_grid","title":"...","content":{"cards":[{"heading":"...","text":"..."}]},"speaker_notes":"..."}
key_message:     {"layout":"key_message","title":"...","content":{"message":"...","subtext":"..."},"speaker_notes":"..."}
process_flow:    {"layout":"process_flow","title":"...","content":{"steps":[{"label":"...","desc":"..."}]},"speaker_notes":"..."}
chart_bar:       {"layout":"chart_bar","title":"...","content":{"categories":["A","B"],"series":[{"name":"Metric","values":[10,20]}]},"speaker_notes":"..."}
chart_pie:       {"layout":"chart_pie","title":"...","content":{"slices":[{"label":"A","value":60},{"label":"B","value":40}]},"speaker_notes":"..."}
big_stat:        {"layout":"big_stat","title":"...","content":{"value":"...","label":"...","context":["...","..."]},"speaker_notes":"..."}
two_column:      {"layout":"two_column","title":"...","content":{"left":{"heading":"...","items":["..."]},"right":{"heading":"...","items":["..."]}},"speaker_notes":"..."}
comparison:      {"layout":"comparison","title":"...","content":{"left":{"label":"...","items":["..."]},"right":{"label":"...","items":["..."]}},"speaker_notes":"..."}
timeline:        {"layout":"timeline","title":"...","content":{"steps":[{"label":"...","event":"..."}]},"speaker_notes":"..."}
quote:           {"layout":"quote","title":"...","content":{"quote":"...","attribution":"..."},"speaker_notes":"..."}
section_divider: {"layout":"section_divider","title":"...","content":{"subtitle":"..."},"speaker_notes":"..."}
title_content:   {"layout":"title_content","title":"...","content":{"type":"bullets","items":["..."]},"speaker_notes":"..."}

Respond with ONLY a JSON array: [{blueprint1}, {blueprint2}, ...]
No markdown, no wrapper object, just the raw array."""


def _get_client() -> AsyncOpenAI:
    kwargs: dict = {"api_key": settings.openai_api_key}
    if settings.openai_base_url:
        kwargs["base_url"] = settings.openai_base_url
    return AsyncOpenAI(**kwargs)


async def plan_presentation(content_text: str, title: str = "", language_hint: str = "") -> list[dict]:
    """
    Ask AI to produce a full slide plan from the provided text content.
    Returns a list of blueprint dicts ready for render_slide_pptx().
    """
    client = _get_client()

    lang_note = f"\nIMPORTANT: Write all slide text in {language_hint}." if language_hint else ""
    user_msg = (
        f"Presentation title: {title}\n\n"
        f"Content to convert into slides:\n\n{content_text[:12000]}"
        f"{lang_note}"
    )

    resp = await client.chat.completions.create(
        model=settings.generator_model,
        messages=[
            {"role": "system", "content": _PLAN_SYSTEM},
            {"role": "user",   "content": user_msg},
        ],
        temperature=0.6,
        max_tokens=6000,
    )

    raw = (resp.choices[0].message.content or "[]").strip()

    # Strip markdown fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rsplit("```", 1)[0]

    blueprints: list[dict] = json.loads(raw.strip())

    # Sanitise each blueprint
    for bp in blueprints:
        bp.setdefault("layout", "title_content")
        bp.setdefault("title", "")
        bp.setdefault("content", {})
        bp.setdefault("speaker_notes", "")

    return blueprints


# ─── Assembly creation from plan ──────────────────────────────────────────────

async def create_assembly_from_plan(
    blueprints: list[dict],
    title: str,
    brand_template_id: int | None,
    user_id: int,
    db: Session,
) -> int:
    """
    Render each blueprint → SlideLibraryEntry (with thumbnail) → AssembledPresentation.
    Returns the assembly ID.
    """
    from services.slide_generator import (
        BrandColors, _extract_brand_colors, save_slide_from_blueprint,
    )
    from models.brand import BrandTemplate
    from models.assembly import AssembledPresentation

    # Load brand colors once for all slides
    colors: BrandColors = BrandColors()
    template_pptx_path: str | None = None

    if brand_template_id:
        tmpl = db.query(BrandTemplate).filter(BrandTemplate.id == brand_template_id).first()
        if tmpl:
            if tmpl.pptx_path and os.path.exists(tmpl.pptx_path):
                template_pptx_path = tmpl.pptx_path
            stored = json.loads(tmpl.colors_json or "{}")
            if stored:
                colors = BrandColors(**{k: v for k, v in stored.items() if hasattr(BrandColors, k)})
            elif template_pptx_path:
                colors = _extract_brand_colors(template_pptx_path)

    # Render each slide and save to library
    slide_ids: list[int] = []
    for i, bp in enumerate(blueprints):
        entry = await save_slide_from_blueprint(
            db=db,
            blueprint=bp,
            colors=colors,
            template_pptx_path=template_pptx_path,
            user_id=user_id,
            slide_index=i,
        )
        slide_ids.append(entry.id)

    # Create assembly
    assembly = AssembledPresentation(
        owner_id=user_id,
        title=title,
        prompt="(AI-генерация)",
        slide_ids_json=json.dumps(slide_ids),
        status="draft",
    )
    db.add(assembly)
    db.commit()
    db.refresh(assembly)
    return assembly.id, slide_ids
