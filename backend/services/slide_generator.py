"""
Slide generation service — Phase 3.

Flow:
  1. Load brand template (optional) → extract colors
  2. Call Claude Opus via OpenRouter to generate structured blueprint JSON
  3. Render blueprint → python-pptx slide (brand colors applied)
  4. Save PPTX, generate PNG thumbnail (LibreOffice → PyMuPDF)
  5. Create SlideLibraryEntry in DB with embedding
  6. Return entry
"""

import json
import logging
import os
import subprocess
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import fitz  # PyMuPDF
from openai import AsyncOpenAI
from pptx import Presentation
from pptx.chart.data import ChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt
from sqlalchemy.orm import Session

from config import settings
from models.brand import BrandTemplate
from models.slide import SlideLibraryEntry, SourcePresentation
from services.embedding import embed_single

logger = logging.getLogger(__name__)

# ─── Slide canvas ────────────────────────────────────────────────────────────

W = Inches(13.333)
H = Inches(7.5)

# ─── Brand colors ────────────────────────────────────────────────────────────

@dataclass
class BrandColors:
    primary: str = "1E3A8A"
    secondary: str = "3B82F6"
    background: str = "FFFFFF"
    text: str = "0F172A"
    text_body: str = "1E293B"
    text_muted: str = "64748B"
    accent_light: str = "EFF6FF"
    divider: str = "E2E8F0"

    def _rgb(self, h: str) -> RGBColor:
        return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

    @property
    def primary_rgb(self): return self._rgb(self.primary)
    @property
    def secondary_rgb(self): return self._rgb(self.secondary)
    @property
    def bg_rgb(self): return self._rgb(self.background)
    @property
    def text_rgb(self): return self._rgb(self.text)
    @property
    def text_body_rgb(self): return self._rgb(self.text_body)
    @property
    def text_muted_rgb(self): return self._rgb(self.text_muted)
    @property
    def accent_light_rgb(self): return self._rgb(self.accent_light)
    @property
    def divider_rgb(self): return self._rgb(self.divider)


def _extract_brand_colors(pptx_path: str) -> BrandColors:
    """Pull accent1/dk1/lt1 from the PPTX slide master theme."""
    try:
        prs = Presentation(pptx_path)
        NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
        clr_scheme = prs.slide_masters[0].element.find(f".//{{{NS}}}clrScheme")
        if clr_scheme is None:
            return BrandColors()

        def _get(name: str) -> str | None:
            el = clr_scheme.find(f"{{{NS}}}{name}")
            if el is None:
                return None
            for child in el:
                v = child.get("val") or child.get("lastClr")
                if v and len(v) == 6:
                    return v.upper()
            return None

        accent1 = _get("accent1") or "1E3A8A"
        accent2 = _get("accent2") or "3B82F6"
        dk1     = _get("dk1")     or "0F172A"
        lt1     = _get("lt1")     or "FFFFFF"

        return BrandColors(
            primary=accent1,
            secondary=accent2,
            background=lt1,
            text=dk1,
            text_body=dk1,
        )
    except Exception as e:
        logger.warning(f"Color extraction failed: {e}")
        return BrandColors()


# ─── Claude Opus blueprint generation ────────────────────────────────────────

_SYSTEM_PROMPT = """You are an expert presentation designer creating visually rich slides like Gamma and Beautiful.ai.

CRITICAL ANTI-TEXT-WALL RULES (no exceptions):
1. NEVER use title_content with more than 5 bullet points
2. title_content is the LAST RESORT — use visual layouts whenever possible
3. If content has 3-4 concepts/features/benefits → use icon_grid
4. If content has a key insight or strong statement → use key_message
5. If content has a process or sequential steps → use process_flow
6. If content has 3+ numbers/metrics → use chart_bar or chart_pie
7. Split any content that would produce >5 bullets into multiple slides

Available layouts and when to use them:
- icon_grid      — 3-4 concepts/features/benefits with emoji icons (PREFERRED over bullet lists)
- key_message    — one powerful statement that dominates the slide (for key insights)
- process_flow   — sequential steps (3-5) with emoji and descriptions
- chart_bar      — bar/column chart when you have 3+ comparable numeric values
- chart_pie      — pie chart for proportions/shares that sum to 100%
- big_stat       — one large dramatic number + label + 2-3 context bullets
- two_column     — two related topics side by side with bullet lists
- comparison     — explicit A vs B or before/after panels
- timeline       — milestones or historical sequence (max 5 points)
- quote          — powerful quote or testimonial with attribution
- section_divider — full-color section divider (for transitions between topics)
- title_content  — ONLY if none of the above fits AND max 5 short bullets

Respond with ONLY valid JSON (no markdown, no commentary):

icon_grid:       {"layout":"icon_grid","title":"...","content":{"cards":[{"emoji":"🚀","heading":"...","text":"..."},{"emoji":"💡","heading":"...","text":"..."},{"emoji":"📊","heading":"...","text":"..."},{"emoji":"🎯","heading":"...","text":"..."}]},"speaker_notes":"..."}
key_message:     {"layout":"key_message","title":"...","content":{"message":"One powerful statement — max 15 words","subtext":"Optional supporting detail or source"},"speaker_notes":"..."}
process_flow:    {"layout":"process_flow","title":"...","content":{"steps":[{"emoji":"📋","label":"Step name","desc":"Short desc"},{"emoji":"🔍","label":"...","desc":"..."},{"emoji":"✅","label":"...","desc":"..."}]},"speaker_notes":"..."}
chart_bar:       {"layout":"chart_bar","title":"...","content":{"categories":["A","B","C","D"],"series":[{"name":"Metric","values":[10,20,15,30]}]},"speaker_notes":"..."}
chart_pie:       {"layout":"chart_pie","title":"...","content":{"slices":[{"label":"Category A","value":45},{"label":"Category B","value":30},{"label":"Category C","value":25}]},"speaker_notes":"..."}
title_content:   {"layout":"title_content","title":"...","content":{"type":"bullets","items":["...","..."]},"speaker_notes":"..."}
two_column:      {"layout":"two_column","title":"...","content":{"left":{"heading":"...","items":["..."]},"right":{"heading":"...","items":["..."]}},"speaker_notes":"..."}
big_stat:        {"layout":"big_stat","title":"...","content":{"value":"...","label":"...","context":["...","..."]},"speaker_notes":"..."}
section_divider: {"layout":"section_divider","title":"...","content":{"subtitle":"..."},"speaker_notes":"..."}
quote:           {"layout":"quote","title":"...","content":{"quote":"...","attribution":"..."},"speaker_notes":"..."}
comparison:      {"layout":"comparison","title":"...","content":{"left":{"label":"...","items":["..."]},"right":{"label":"...","items":["..."]}},"speaker_notes":"..."}
timeline:        {"layout":"timeline","title":"...","content":{"steps":[{"label":"...","event":"..."}]},"speaker_notes":"..."}

Rules:
- Title: max 60 chars, punchy
- icon_grid cards: 3 or 4 cards; heading max 30 chars; text max 80 chars; use relevant emoji
- key_message: message max 15 words — make it impactful
- process_flow: 3-5 steps; label max 25 chars; desc max 60 chars
- chart_bar/pie: use real numbers from context when available
- Match the language of the user's prompt
- speaker_notes: one sentence of presenter guidance"""


async def generate_blueprint(prompt: str, context: str = "") -> dict:
    kwargs: dict = {"api_key": settings.openai_api_key}
    if settings.openai_base_url:
        kwargs["base_url"] = settings.openai_base_url

    client = AsyncOpenAI(**kwargs)

    user_msg = f"Context: {context}\n\nSlide topic: {prompt}" if context else prompt

    resp = await client.chat.completions.create(
        model=settings.generator_model,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user",   "content": user_msg},
        ],
        temperature=0.7,
        max_tokens=1000,
    )

    raw = resp.choices[0].message.content or "{}"
    # Strip possible markdown fences
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


# ─── python-pptx helpers ─────────────────────────────────────────────────────

def _set_bg(slide, color: RGBColor):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = color


def _add_text(slide, text: str, left, top, width, height, *,
               bold=False, italic=False, size=18,
               color: RGBColor = None, align=PP_ALIGN.LEFT, word_wrap=True):
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = word_wrap
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.bold = bold
    run.font.italic = italic
    run.font.size = Pt(size)
    if color:
        run.font.color.rgb = color
    return txBox


def _add_bullets(slide, items: list[str], left, top, width, height, *,
                  size=16, color: RGBColor = None):
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_before = Pt(5)
        run = p.add_run()
        run.text = f"  •  {item}"
        run.font.size = Pt(size)
        if color:
            run.font.color.rgb = color
    return txBox


def _add_rect(slide, left, top, width, height, *,
               fill: RGBColor = None, line: RGBColor = None):
    shape = slide.shapes.add_shape(1, left, top, width, height)
    if fill:
        shape.fill.solid()
        shape.fill.fore_color.rgb = fill
    else:
        shape.fill.background()
    if line:
        shape.line.color.rgb = line
    else:
        shape.line.fill.background()
    return shape


def _add_oval(slide, left, top, width, height, *, fill: RGBColor = None):
    shape = slide.shapes.add_shape(9, left, top, width, height)
    if fill:
        shape.fill.solid()
        shape.fill.fore_color.rgb = fill
    else:
        shape.fill.background()
    shape.line.fill.background()
    return shape


# ─── Layout renderers ─────────────────────────────────────────────────────────

def _render_title_content(slide, bp: dict, c: BrandColors):
    items    = bp.get("content", {}).get("items", [])
    body_txt = bp.get("content", {}).get("text", "")

    _add_rect(slide, Inches(0),    Inches(0), Inches(0.18), H,            fill=c.primary_rgb)
    _add_rect(slide, Inches(0.18), Inches(0), W-Inches(0.18), Inches(1.6), fill=RGBColor(248,250,252))
    _add_text(slide, bp.get("title",""),
              Inches(0.45), Inches(0.3), W-Inches(0.65), Inches(1.1),
              bold=True, size=30, color=c.text_rgb)
    _add_rect(slide, Inches(0.18), Inches(1.6), W-Inches(0.18), Inches(0.04), fill=c.divider_rgb)

    if items:
        _add_bullets(slide, items, Inches(0.55), Inches(1.85), W-Inches(0.75), H-Inches(2.05),
                     size=18, color=c.text_body_rgb)
    elif body_txt:
        _add_text(slide, body_txt, Inches(0.55), Inches(1.85), W-Inches(0.75), H-Inches(2.05),
                  size=18, color=c.text_body_rgb)


def _render_two_column(slide, bp: dict, c: BrandColors):
    lc = bp.get("content", {}).get("left",  {})
    rc = bp.get("content", {}).get("right", {})

    _add_rect(slide, Inches(0),    Inches(0), Inches(0.18), H,            fill=c.primary_rgb)
    _add_rect(slide, Inches(0.18), Inches(0), W-Inches(0.18), Inches(1.35), fill=RGBColor(248,250,252))
    _add_text(slide, bp.get("title",""),
              Inches(0.45), Inches(0.25), W-Inches(0.65), Inches(0.95),
              bold=True, size=26, color=c.text_rgb)
    _add_rect(slide, Inches(0.18), Inches(1.35), W-Inches(0.18), Inches(0.04), fill=c.divider_rgb)

    col_w = (W - Inches(0.18) - Inches(0.45)) / 2 - Inches(0.15)
    lx, rx = Inches(0.45), W/2 + Inches(0.1)

    _add_rect(slide, W/2-Inches(0.02), Inches(1.45), Inches(0.04), H-Inches(1.55), fill=c.divider_rgb)

    if lc.get("heading"):
        _add_text(slide, lc["heading"], lx, Inches(1.55), col_w, Inches(0.65),
                  bold=True, size=16, color=c.primary_rgb)
    if lc.get("items"):
        _add_bullets(slide, lc["items"], lx, Inches(2.2), col_w, H-Inches(2.4),
                     size=16, color=c.text_body_rgb)

    if rc.get("heading"):
        _add_text(slide, rc["heading"], rx, Inches(1.55), col_w, Inches(0.65),
                  bold=True, size=16, color=c.primary_rgb)
    if rc.get("items"):
        _add_bullets(slide, rc["items"], rx, Inches(2.2), col_w, H-Inches(2.4),
                     size=16, color=c.text_body_rgb)


def _render_big_stat(slide, bp: dict, c: BrandColors):
    content = bp.get("content", {})

    _add_rect(slide, Inches(0), Inches(0), Inches(0.18), H, fill=c.primary_rgb)
    _add_text(slide, bp.get("title",""),
              Inches(0.45), Inches(0.3), Inches(8), Inches(0.65),
              bold=False, size=18, color=c.text_muted_rgb)
    _add_text(slide, content.get("value",""),
              Inches(0.35), Inches(1.1), Inches(6.5), Inches(3.0),
              bold=True, size=96, color=c.primary_rgb, word_wrap=False)
    _add_text(slide, content.get("label",""),
              Inches(0.45), Inches(4.2), Inches(5), Inches(0.75),
              bold=False, size=22, color=c.text_muted_rgb)

    ctx = content.get("context", [])
    if ctx:
        _add_rect(slide, Inches(7.3), Inches(1.1), Inches(0.04), Inches(5.5), fill=c.divider_rgb)
        _add_bullets(slide, ctx, Inches(7.6), Inches(1.6), Inches(5.2), Inches(5.0),
                     size=18, color=c.text_body_rgb)


def _render_section_divider(slide, bp: dict, c: BrandColors):
    _set_bg(slide, c.primary_rgb)
    _add_text(slide, bp.get("title",""),
              Inches(1.0), Inches(1.8), W-Inches(2.0), Inches(2.8),
              bold=True, size=44, color=RGBColor(255,255,255),
              align=PP_ALIGN.CENTER)
    subtitle = bp.get("content", {}).get("subtitle","")
    if subtitle:
        _add_text(slide, subtitle,
                  Inches(1.5), Inches(4.8), W-Inches(3.0), Inches(1.2),
                  size=22, color=RGBColor(200,215,240),
                  align=PP_ALIGN.CENTER)
    _add_rect(slide, Inches(0), H-Inches(0.18), W, Inches(0.18), fill=c.secondary_rgb)


def _render_quote(slide, bp: dict, c: BrandColors):
    content = bp.get("content", {})
    _set_bg(slide, RGBColor(248,250,252))
    _add_rect(slide, Inches(0), Inches(0), Inches(0.18), H, fill=c.secondary_rgb)

    # Decorative large quote mark
    _add_text(slide, "\u201C",
              Inches(0.5), Inches(0.1), Inches(2.5), Inches(2.5),
              bold=True, size=120, color=c.accent_light_rgb, word_wrap=False)

    _add_text(slide, content.get("quote",""),
              Inches(1.0), Inches(1.4), W-Inches(2.2), Inches(3.6),
              size=24, color=c.text_rgb)

    if content.get("attribution"):
        _add_rect(slide, Inches(1.0), Inches(5.2), Inches(1.8), Inches(0.05), fill=c.secondary_rgb)
        _add_text(slide, f"— {content['attribution']}",
                  Inches(1.0), Inches(5.4), W-Inches(2.0), Inches(0.8),
                  size=16, italic=True, color=c.text_muted_rgb)


def _render_comparison(slide, bp: dict, c: BrandColors):
    lc = bp.get("content", {}).get("left",  {})
    rc = bp.get("content", {}).get("right", {})

    _add_rect(slide, Inches(0),    Inches(0), Inches(0.18), H,            fill=c.primary_rgb)
    _add_rect(slide, Inches(0.18), Inches(0), W-Inches(0.18), Inches(1.2), fill=RGBColor(248,250,252))
    _add_text(slide, bp.get("title",""),
              Inches(0.45), Inches(0.22), W-Inches(0.65), Inches(0.85),
              bold=True, size=26, color=c.text_rgb)
    _add_rect(slide, Inches(0.18), Inches(1.2), W-Inches(0.18), Inches(0.04), fill=c.divider_rgb)

    pw   = (W - Inches(0.18) - Inches(0.4)) / 2
    ph   = H - Inches(1.3)
    top  = Inches(1.28)
    lx, rx = Inches(0.28), Inches(0.28) + pw + Inches(0.4)

    # Left panel
    _add_rect(slide, lx, top, pw, ph, fill=c.accent_light_rgb)
    _add_rect(slide, lx, top, pw, Inches(0.55), fill=c.primary_rgb)
    _add_text(slide, lc.get("label",""), lx+Inches(0.15), top+Inches(0.07), pw-Inches(0.3), Inches(0.45),
              bold=True, size=16, color=RGBColor(255,255,255), align=PP_ALIGN.CENTER)
    if lc.get("items"):
        _add_bullets(slide, lc["items"], lx+Inches(0.2), top+Inches(0.7), pw-Inches(0.35), ph-Inches(0.85),
                     size=15, color=c.text_body_rgb)

    # Right panel
    _add_rect(slide, rx, top, pw, ph, fill=RGBColor(240,253,244))
    _add_rect(slide, rx, top, pw, Inches(0.55), fill=c.secondary_rgb)
    _add_text(slide, rc.get("label",""), rx+Inches(0.15), top+Inches(0.07), pw-Inches(0.3), Inches(0.45),
              bold=True, size=16, color=RGBColor(255,255,255), align=PP_ALIGN.CENTER)
    if rc.get("items"):
        _add_bullets(slide, rc["items"], rx+Inches(0.2), top+Inches(0.7), pw-Inches(0.35), ph-Inches(0.85),
                     size=15, color=c.text_body_rgb)


def _render_timeline(slide, bp: dict, c: BrandColors):
    steps = bp.get("content", {}).get("steps", [])[:5]

    _add_rect(slide, Inches(0),    Inches(0), Inches(0.18), H,            fill=c.primary_rgb)
    _add_rect(slide, Inches(0.18), Inches(0), W-Inches(0.18), Inches(1.3), fill=RGBColor(248,250,252))
    _add_text(slide, bp.get("title",""),
              Inches(0.45), Inches(0.25), W-Inches(0.65), Inches(0.9),
              bold=True, size=26, color=c.text_rgb)

    if not steps:
        return

    n      = len(steps)
    line_y = Inches(3.9)
    x0     = Inches(0.9)
    x1     = W - Inches(0.7)
    step_w = (x1 - x0) / n

    # Horizontal axis
    _add_rect(slide, x0, line_y, x1-x0, Inches(0.06), fill=c.primary_rgb)

    for i, step in enumerate(steps):
        cx = x0 + step_w * i + step_w / 2
        r  = Inches(0.22)

        # Dot
        _add_oval(slide, cx-r, line_y-r+Inches(0.03), r*2, r*2, fill=c.primary_rgb)

        # Label above (year / step number)
        _add_text(slide, step.get("label",""),
                  cx-step_w/2+Inches(0.05), Inches(2.85), step_w-Inches(0.1), Inches(0.65),
                  bold=True, size=14, color=c.primary_rgb, align=PP_ALIGN.CENTER)

        # Event below
        _add_text(slide, step.get("event",""),
                  cx-step_w/2+Inches(0.05), line_y+Inches(0.55), step_w-Inches(0.1), Inches(2.4),
                  size=13, color=c.text_body_rgb, align=PP_ALIGN.CENTER, word_wrap=True)


# ─── New visual layout renderers ──────────────────────────────────────────────

def _render_icon_grid(slide, bp: dict, c: BrandColors):
    """3 or 4 cards, each with emoji + heading + short text."""
    cards = bp.get("content", {}).get("cards", [])[:4]
    if not cards:
        _render_title_content(slide, bp, c)
        return

    _add_rect(slide, Inches(0),    Inches(0), Inches(0.18), H,             fill=c.primary_rgb)
    _add_rect(slide, Inches(0.18), Inches(0), W-Inches(0.18), Inches(1.3), fill=RGBColor(248,250,252))
    _add_text(slide, bp.get("title",""),
              Inches(0.45), Inches(0.22), W-Inches(0.65), Inches(0.9),
              bold=True, size=26, color=c.text_rgb)
    _add_rect(slide, Inches(0.18), Inches(1.3), W-Inches(0.18), Inches(0.04), fill=c.divider_rgb)

    n       = len(cards)
    cols    = 2 if n > 2 else n
    rows    = (n + cols - 1) // cols
    pad     = Inches(0.25)
    x0      = Inches(0.32)
    y0      = Inches(1.45)
    avail_w = W - x0 - Inches(0.14)
    avail_h = H - y0 - Inches(0.15)
    card_w  = (avail_w - pad * (cols - 1)) / cols
    card_h  = (avail_h - pad * (rows - 1)) / rows

    for i, card in enumerate(cards):
        row = i // cols
        col = i % cols
        cx = x0 + col * (card_w + pad)
        cy = y0 + row * (card_h + pad)

        # Card background
        _add_rect(slide, cx, cy, card_w, card_h, fill=RGBColor(248, 250, 252))
        # Left accent strip
        _add_rect(slide, cx, cy, Inches(0.06), card_h, fill=c.secondary_rgb)

        # Emoji
        emoji = card.get("emoji", "●")
        _add_text(slide, emoji,
                  cx + Inches(0.12), cy + Inches(0.1), Inches(0.65), Inches(0.65),
                  size=28, word_wrap=False)

        # Heading
        _add_text(slide, card.get("heading", ""),
                  cx + Inches(0.8), cy + Inches(0.1), card_w - Inches(0.9), Inches(0.55),
                  bold=True, size=15, color=c.text_rgb)

        # Body text
        _add_text(slide, card.get("text", ""),
                  cx + Inches(0.12), cy + Inches(0.72), card_w - Inches(0.2), card_h - Inches(0.82),
                  size=13, color=c.text_muted_rgb)


def _render_key_message(slide, bp: dict, c: BrandColors):
    """One powerful statement dominates the slide."""
    content = bp.get("content", {})
    message = content.get("message", bp.get("title", ""))
    subtext = content.get("subtext", "")
    label   = bp.get("title", "")

    _set_bg(slide, RGBColor(248, 250, 252))
    _add_rect(slide, Inches(0), Inches(0),      Inches(0.18), H,            fill=c.primary_rgb)
    _add_rect(slide, Inches(0), H-Inches(0.18), W,            Inches(0.18), fill=c.secondary_rgb)

    # Small label at top
    if label and label != message:
        _add_text(slide, label.upper(),
                  Inches(0.45), Inches(0.28), W-Inches(0.6), Inches(0.5),
                  size=11, color=c.text_muted_rgb, word_wrap=False)

    # The big message
    _add_text(slide, message,
              Inches(0.45), Inches(0.9), W-Inches(0.65), Inches(4.8),
              bold=True, size=40, color=c.text_rgb)

    # Subtext
    if subtext:
        _add_rect(slide, Inches(0.45), Inches(5.85), Inches(1.5), Inches(0.04), fill=c.secondary_rgb)
        _add_text(slide, subtext,
                  Inches(0.45), Inches(6.0), W-Inches(0.65), Inches(0.9),
                  size=16, color=c.text_muted_rgb, italic=True)


def _render_process_flow(slide, bp: dict, c: BrandColors):
    """Horizontal steps with emoji, label, and short description."""
    steps = bp.get("content", {}).get("steps", [])[:5]
    if not steps:
        _render_title_content(slide, bp, c)
        return

    _add_rect(slide, Inches(0),    Inches(0), Inches(0.18), H,             fill=c.primary_rgb)
    _add_rect(slide, Inches(0.18), Inches(0), W-Inches(0.18), Inches(1.3), fill=RGBColor(248,250,252))
    _add_text(slide, bp.get("title",""),
              Inches(0.45), Inches(0.22), W-Inches(0.65), Inches(0.9),
              bold=True, size=26, color=c.text_rgb)
    _add_rect(slide, Inches(0.18), Inches(1.3), W-Inches(0.18), Inches(0.04), fill=c.divider_rgb)

    n       = len(steps)
    x0      = Inches(0.35)
    x1      = W - Inches(0.2)
    step_w  = (x1 - x0) / n
    circle_y = Inches(2.6)
    r        = Inches(0.45)

    # Connecting line between circles
    line_y = circle_y + r
    _add_rect(slide, x0 + r, line_y - Inches(0.03), x1 - x0 - r * 2, Inches(0.06),
              fill=c.divider_rgb)

    for i, step in enumerate(steps):
        cx = x0 + step_w * i + step_w / 2

        # Numbered circle background
        _add_oval(slide, cx - r, circle_y, r * 2, r * 2, fill=c.primary_rgb)
        # Step number
        _add_text(slide, str(i + 1),
                  cx - r, circle_y, r * 2, r * 2,
                  bold=True, size=18, color=RGBColor(255,255,255), align=PP_ALIGN.CENTER)

        # Emoji above circle
        emoji = step.get("emoji", "")
        if emoji:
            _add_text(slide, emoji,
                      cx - step_w/2 + Inches(0.05), Inches(1.55), step_w - Inches(0.1), Inches(0.8),
                      size=26, align=PP_ALIGN.CENTER, word_wrap=False)

        # Label below circle
        _add_text(slide, step.get("label", ""),
                  cx - step_w/2 + Inches(0.05), circle_y + r*2 + Inches(0.15),
                  step_w - Inches(0.1), Inches(0.6),
                  bold=True, size=13, color=c.text_rgb, align=PP_ALIGN.CENTER)

        # Description
        _add_text(slide, step.get("desc", ""),
                  cx - step_w/2 + Inches(0.05), circle_y + r*2 + Inches(0.85),
                  step_w - Inches(0.1), Inches(2.0),
                  size=12, color=c.text_muted_rgb, align=PP_ALIGN.CENTER, word_wrap=True)

        # Arrow between steps (except last)
        if i < n - 1:
            ax = cx + step_w / 2 - Inches(0.12)
            _add_text(slide, "→",
                      ax, circle_y + Inches(0.05), Inches(0.35), Inches(0.8),
                      size=22, color=c.divider_rgb, align=PP_ALIGN.CENTER)


def _render_chart_bar(slide, bp: dict, c: BrandColors):
    """Column chart using python-pptx Charts API."""
    content    = bp.get("content", {})
    categories = content.get("categories", [])
    series_data = content.get("series", [])

    _add_rect(slide, Inches(0),    Inches(0), Inches(0.18), H,             fill=c.primary_rgb)
    _add_rect(slide, Inches(0.18), Inches(0), W-Inches(0.18), Inches(1.3), fill=RGBColor(248,250,252))
    _add_text(slide, bp.get("title",""),
              Inches(0.45), Inches(0.22), W-Inches(0.65), Inches(0.9),
              bold=True, size=26, color=c.text_rgb)
    _add_rect(slide, Inches(0.18), Inches(1.3), W-Inches(0.18), Inches(0.04), fill=c.divider_rgb)

    if not categories or not series_data:
        return

    try:
        chart_data = ChartData()
        chart_data.categories = categories
        for s in series_data:
            chart_data.add_series(s.get("name", ""), tuple(s.get("values", [])))

        chart_frame = slide.shapes.add_chart(
            XL_CHART_TYPE.COLUMN_CLUSTERED,
            Inches(0.45), Inches(1.5), W - Inches(0.65), H - Inches(1.7),
            chart_data
        )
        chart = chart_frame.chart
        chart.has_legend = len(series_data) > 1

        # Style the chart
        plot = chart.plots[0]
        for i, series in enumerate(plot.series):
            fill = series.format.fill
            fill.solid()
            fill.fore_color.rgb = c.primary_rgb if i == 0 else c.secondary_rgb

        chart.category_axis.tick_labels.font.size = Pt(11)
        chart.value_axis.tick_labels.font.size = Pt(11)
        chart.chart_style = 2
    except Exception as e:
        logger.warning(f"chart_bar render failed: {e}")
        # Fallback to title_content
        _render_title_content(slide, {
            **bp,
            "content": {"type": "bullets", "items": [
                f"{cat}: {s.get('values', [])[i] if i < len(s.get('values', [])) else '?'}"
                for s in series_data
                for i, cat in enumerate(categories)
            ][:6]}
        }, c)


def _render_chart_pie(slide, bp: dict, c: BrandColors):
    """Pie chart using python-pptx Charts API."""
    content = bp.get("content", {})
    slices  = content.get("slices", [])

    _add_rect(slide, Inches(0),    Inches(0), Inches(0.18), H,             fill=c.primary_rgb)
    _add_rect(slide, Inches(0.18), Inches(0), W-Inches(0.18), Inches(1.3), fill=RGBColor(248,250,252))
    _add_text(slide, bp.get("title",""),
              Inches(0.45), Inches(0.22), W-Inches(0.65), Inches(0.9),
              bold=True, size=26, color=c.text_rgb)
    _add_rect(slide, Inches(0.18), Inches(1.3), W-Inches(0.18), Inches(0.04), fill=c.divider_rgb)

    if not slices:
        return

    try:
        chart_data = ChartData()
        chart_data.categories = [s.get("label", f"Item {i+1}") for i, s in enumerate(slices)]
        chart_data.add_series("", tuple(s.get("value", 0) for s in slices))

        chart_frame = slide.shapes.add_chart(
            XL_CHART_TYPE.PIE,
            Inches(0.45), Inches(1.5), W - Inches(0.65), H - Inches(1.7),
            chart_data
        )
        chart = chart_frame.chart
        chart.has_legend = True
        chart.chart_style = 2

        plot = chart.plots[0]
        plot.has_data_labels = True
        plot.data_labels.show_percentage = True
        plot.data_labels.show_category_name = False
    except Exception as e:
        logger.warning(f"chart_pie render failed: {e}")
        items = [f"{s.get('label','?')}: {s.get('value','?')}%" for s in slices]
        _render_title_content(slide, {**bp, "content": {"type": "bullets", "items": items[:6]}}, c)


# ─── Dispatch ────────────────────────────────────────────────────────────────

_RENDERERS = {
    "title_content":   _render_title_content,
    "two_column":      _render_two_column,
    "big_stat":        _render_big_stat,
    "section_divider": _render_section_divider,
    "quote":           _render_quote,
    "comparison":      _render_comparison,
    "timeline":        _render_timeline,
    # New visual layouts
    "icon_grid":       _render_icon_grid,
    "key_message":     _render_key_message,
    "process_flow":    _render_process_flow,
    "chart_bar":       _render_chart_bar,
    "chart_pie":       _render_chart_pie,
}


def render_slide_pptx(blueprint: dict, colors: BrandColors,
                       template_pptx_path: str | None = None) -> Presentation:
    """
    Render a blueprint into a single-slide Presentation.
    If a template is provided, the presentation inherits its theme/master.
    """
    if template_pptx_path:
        prs = Presentation(template_pptx_path)
        # Remove all pre-existing slides, keep theme/master
        sldIdLst = prs.slides._sldIdLst
        for sld_id in list(sldIdLst):
            sldIdLst.remove(sld_id)
    else:
        prs = Presentation()
        prs.slide_width  = W
        prs.slide_height = H

    # Add blank slide
    try:
        blank_layout = prs.slide_layouts[6]
    except IndexError:
        blank_layout = prs.slide_layouts[0]

    slide = prs.slides.add_slide(blank_layout)

    # Remove any inherited placeholder shapes from the blank layout
    for shape in list(slide.shapes):
        ph = getattr(shape, "placeholder_format", None)
        if ph is not None:
            sp = shape._element
            sp.getparent().remove(sp)

    layout = blueprint.get("layout", "title_content")
    # Only force white background when no template is provided.
    # When using a template, the background image/color comes from the slide master.
    if layout != "section_divider" and not template_pptx_path:
        _set_bg(slide, RGBColor(255, 255, 255))

    renderer = _RENDERERS.get(layout, _render_title_content)
    renderer(slide, blueprint, colors)
    return prs


# ─── Thumbnail ───────────────────────────────────────────────────────────────

def _render_thumbnail(pptx_path: str, out_dir: str) -> str | None:
    """PPTX → PDF via LibreOffice → PNG via PyMuPDF."""
    try:
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(
                ["libreoffice", "--headless", "--convert-to", "pdf",
                 "--outdir", tmp, pptx_path],
                capture_output=True, timeout=60,
            )
            pdfs = list(Path(tmp).glob("*.pdf"))
            if not pdfs:
                return None

            doc  = fitz.open(str(pdfs[0]))
            page = doc[0]
            pix  = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))
            out  = os.path.join(out_dir, "0.png")
            pix.save(out)
            return out
    except Exception as e:
        logger.error(f"Thumbnail render failed: {e}")
        return None


# ─── Main entry point ─────────────────────────────────────────────────────────

async def generate_slide(
    db: Session,
    prompt: str,
    template_id: int | None,
    user_id: int | None,
    context: str = "",
) -> SlideLibraryEntry:
    """Full pipeline → returns saved SlideLibraryEntry."""

    # 1. Load brand template
    colors: BrandColors = BrandColors()
    template_pptx_path: str | None = None

    if template_id:
        tmpl = db.query(BrandTemplate).filter(BrandTemplate.id == template_id).first()
        if tmpl:
            if tmpl.pptx_path and os.path.exists(tmpl.pptx_path):
                template_pptx_path = tmpl.pptx_path
                stored = json.loads(tmpl.colors_json or "{}")
                if stored:
                    colors = BrandColors(**{k: v for k, v in stored.items()
                                           if hasattr(BrandColors, k)})
                else:
                    colors = _extract_brand_colors(template_pptx_path)

    # 2. Generate blueprint
    blueprint = await generate_blueprint(prompt, context)
    blueprint.setdefault("layout", "title_content")
    blueprint.setdefault("title", prompt[:60])
    blueprint.setdefault("content", {"type": "bullets", "items": []})

    # 3. Render PPTX
    prs = render_slide_pptx(blueprint, colors, template_pptx_path)

    # 4. Save PPTX
    gen_dir = Path(settings.upload_dir) / "generated"
    gen_dir.mkdir(parents=True, exist_ok=True)
    pptx_path = str(gen_dir / f"gen_{uuid.uuid4()}.pptx")
    prs.save(pptx_path)

    # 5. SourcePresentation record
    title = blueprint.get("title", prompt)[:80]
    source = SourcePresentation(
        owner_id=user_id,
        filename=f"[AI] {title}.pptx",
        file_path=pptx_path,
        file_type="pptx",
        slide_count=1,
        status="done",
    )
    db.add(source)
    db.flush()

    # 6. Thumbnail
    thumb_dir = Path(settings.thumbnail_dir) / str(source.id)
    thumb_dir.mkdir(parents=True, exist_ok=True)
    thumb_abs = _render_thumbnail(pptx_path, str(thumb_dir))

    if not thumb_abs:
        # Pillow fallback
        from services.thumbnail import _make_placeholder_thumbnail
        data = _make_placeholder_thumbnail(title, 0)
        thumb_abs = str(thumb_dir / "0.png")
        Path(thumb_abs).write_bytes(data)

    thumbnail_path = f"{source.id}/0.png"

    # 7. XML blob
    xml_blob: str | None = None
    try:
        from lxml import etree
        prs2 = Presentation(pptx_path)
        if prs2.slides:
            xml_blob = etree.tostring(prs2.slides[0]._element, encoding="unicode")
    except Exception:
        pass

    # 8. Embedding
    summary = _blueprint_to_summary(blueprint)
    tags    = _blueprint_to_tags(blueprint)
    embedding: list[float] | None = None
    try:
        from services.embedding import build_slide_embed_text
        embed_text = build_slide_embed_text(title, summary, tags)
        embedding  = await embed_single(embed_text)
    except Exception as e:
        logger.warning(f"Embedding failed: {e}")

    # 9. Save SlideLibraryEntry
    entry = SlideLibraryEntry(
        source_id      = source.id,
        slide_index    = 0,
        thumbnail_path = thumbnail_path,
        xml_blob       = xml_blob,
        title          = title,
        summary        = summary,
        tags_json      = json.dumps(tags, ensure_ascii=False),
        layout_type    = blueprint.get("layout", "title_content"),
        language       = _detect_language(prompt),
        embedding_json = json.dumps(embedding) if embedding else None,
        has_media      = False,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    db.refresh(source)
    entry.source = source

    return entry


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _blueprint_to_summary(bp: dict) -> str:
    layout  = bp.get("layout", "")
    content = bp.get("content", {})
    if layout == "big_stat":
        v, l = content.get("value",""), content.get("label","")
        return f"{v} — {l}".strip(" —")
    if layout == "quote":
        return (content.get("quote","") or "")[:150]
    if layout == "section_divider":
        return content.get("subtitle","")

    items = content.get("items", [])
    if not items:
        items  = content.get("left",  {}).get("items", [])
        items += content.get("right", {}).get("items", [])
    if not items:
        items = [s.get("event","") for s in content.get("steps", [])]
    return "; ".join(items[:3])[:200]


def _blueprint_to_tags(bp: dict) -> list[str]:
    stop = {"и","в","на","за","по","с","а","the","a","in","of","for","and","to","is","are"}
    tags = [bp.get("layout","").replace("_","-")]
    words = bp.get("title","").lower().split()
    tags += [w for w in words if len(w) > 3 and w not in stop][:3]
    return [t for t in tags if t][:5]


def _detect_language(text: str) -> str:
    cyr = sum(1 for c in text if "\u0400" <= c <= "\u04FF")
    return "ru" if cyr > len(text) * 0.25 else "en"
