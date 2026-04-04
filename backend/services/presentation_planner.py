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
        lines.append(f"\n--- Страница {i} ---")
        lines.append(page.get_text("text").strip())
    return "\n".join(lines)


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

_PLAN_SYSTEM = """You are a world-class presentation designer creating visually stunning decks like Gamma and Beautiful.ai.

Your task: analyse the provided content and produce a complete slide deck as a JSON array of slide blueprints.

STRICT VISUAL RULES — NO EXCEPTIONS:
1. NEVER use title_content with more than 5 short bullets. If content is longer, split into multiple slides or use a different layout.
2. title_content is the LAST RESORT. Prefer visual layouts:
   • 3-4 concepts/features/benefits → icon_grid (with relevant emoji)
   • Key insight or powerful statement → key_message
   • Sequential process (3-5 steps) → process_flow
   • 3+ comparable numbers → chart_bar
   • Proportions / market share → chart_pie
   • One big dramatic number → big_stat
   • Two sides of a story → comparison or two_column
   • Quote or testimonial → quote
   • Section transition → section_divider
3. Vary layouts — no two consecutive slides may use the same layout.
4. Every icon_grid card must have a relevant emoji.
5. Every process_flow step must have a relevant emoji.
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

icon_grid:       {"layout":"icon_grid","title":"...","content":{"cards":[{"emoji":"🚀","heading":"...","text":"..."}]},"speaker_notes":"..."}
key_message:     {"layout":"key_message","title":"...","content":{"message":"...","subtext":"..."},"speaker_notes":"..."}
process_flow:    {"layout":"process_flow","title":"...","content":{"steps":[{"emoji":"📋","label":"...","desc":"..."}]},"speaker_notes":"..."}
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


# ─── Multi-slide PPTX rendering ───────────────────────────────────────────────

async def render_presentation(
    blueprints: list[dict],
    brand_template_id: int | None,
    db: Session,
) -> str:
    """
    Render a list of blueprints into a single multi-slide PPTX file.
    Returns the absolute file path of the saved PPTX.
    """
    from services.slide_generator import BrandColors, render_slide_pptx, _extract_brand_colors
    from models.brand import BrandTemplate

    # Load brand
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

    # Build presentation by rendering each blueprint as a single-slide Prs
    # and copying the slide element into a master Prs.
    if template_pptx_path:
        master_prs = Presentation(template_pptx_path)
        # Remove pre-existing slides
        sld_id_lst = master_prs.slides._sldIdLst
        for sld_id in list(sld_id_lst):
            sld_id_lst.remove(sld_id)
    else:
        from pptx.util import Inches as _I
        master_prs = Presentation()
        master_prs.slide_width  = Inches(13.333)
        master_prs.slide_height = Inches(7.5)

    for bp in blueprints:
        single = render_slide_pptx(bp, colors, template_pptx_path)
        if not single.slides:
            continue

        # Add a blank slide to master, then replace its XML with the rendered one
        try:
            blank_layout = master_prs.slide_layouts[6]
        except IndexError:
            blank_layout = master_prs.slide_layouts[0]

        new_slide = master_prs.slides.add_slide(blank_layout)

        # Remove placeholder shapes
        for shape in list(new_slide.shapes):
            ph = getattr(shape, "placeholder_format", None)
            if ph is not None:
                sp = shape._element
                sp.getparent().remove(sp)

        # Copy all shape elements from rendered slide
        src_slide = single.slides[0]
        for elem in list(src_slide.shapes._spTree):
            new_slide.shapes._spTree.append(elem)

        # Copy background
        src_bg = src_slide.background.element
        dst_bg = new_slide.background.element
        from lxml import etree
        for child in list(dst_bg):
            dst_bg.remove(child)
        for child in src_bg:
            dst_bg.append(child.__copy__() if hasattr(child, '__copy__') else child)

    # Save
    gen_dir = Path(settings.upload_dir) / "generated"
    gen_dir.mkdir(parents=True, exist_ok=True)
    out_path = str(gen_dir / f"pres_{uuid.uuid4()}.pptx")
    master_prs.save(out_path)
    return out_path


async def plan_and_render(
    file_bytes: bytes | None,
    file_ext: str | None,
    text_prompt: str | None,
    title: str,
    brand_template_id: int | None,
    db: Session,
    language_hint: str = "",
) -> tuple[list[dict], str]:
    """
    Full pipeline:
      extract text → plan blueprints → render PPTX
    Returns (blueprints, pptx_path).
    """
    # 1. Get content text
    if file_bytes and file_ext:
        content = extract_text(file_bytes, file_ext)
        if text_prompt:
            content = f"Additional instructions: {text_prompt}\n\n{content}"
    elif text_prompt:
        content = text_prompt
    else:
        raise ValueError("Provide either a file or a text prompt")

    # 2. Plan
    blueprints = await plan_presentation(content, title=title, language_hint=language_hint)

    # 3. Render
    pptx_path = await render_presentation(blueprints, brand_template_id, db)

    return blueprints, pptx_path
