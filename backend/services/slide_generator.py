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
from dataclasses import dataclass
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
    # ── Strict Brand Guidelines ──────────────────────────────────────────────
    font_family: str = "Montserrat"
    title_font_color: str = "FFFFFF"    # color for title text in header
    title_font_size: int = 30           # pt
    body_font_color: str = "1E293B"     # color for body/bullet text
    body_font_size: int = 18            # pt
    shape_color: str = "1E3A8A"         # color for decorative shapes
    shape_opacity: int = 100            # 0-100
    background_image_path: str | None = None  # filesystem path to bg image

    def _rgb(self, h: str) -> RGBColor:
        h = h.lstrip("#")
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
    def text_body_rgb(self): return self._rgb(self.body_font_color)
    @property
    def text_muted_rgb(self): return self._rgb(self.text_muted)
    @property
    def accent_light_rgb(self): return self._rgb(self.accent_light)
    @property
    def divider_rgb(self): return self._rgb(self.divider)
    @property
    def shape_rgb(self): return self._rgb(self.shape_color)
    @property
    def title_color_rgb(self): return self._rgb(self.title_font_color)


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

_SYSTEM_PROMPT = """You are an expert presentation designer creating visually stunning slides like Gamma and Kimi K2.

CRITICAL ANTI-TEXT-WALL RULES (no exceptions):
1. NEVER use title_content with more than 5 bullet points
2. title_content is the LAST RESORT — use visual layouts whenever possible
3. If content has 3-4 concepts/features/benefits → use icon_grid
4. If content has a key insight or strong statement → use key_message
5. If content has a process or sequential steps → use process_flow
6. If content has 3+ numbers/metrics → use chart_bar or chart_pie
7. Split any content that would produce >5 bullets into multiple slides

Available layouts and when to use them:
- icon_grid      — 3-4 concepts/features/benefits (PREFERRED over bullet lists)
- key_message    — one powerful statement that dominates the slide
- process_flow   — sequential steps (3-5) with descriptions
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

icon_grid:       {"layout":"icon_grid","title":"...","content":{"cards":[{"heading":"...","text":"..."},{"heading":"...","text":"..."},{"heading":"...","text":"..."},{"heading":"...","text":"..."}]},"speaker_notes":"..."}
key_message:     {"layout":"key_message","title":"...","content":{"message":"One powerful statement — max 15 words","subtext":"Optional supporting detail or source"},"speaker_notes":"..."}
process_flow:    {"layout":"process_flow","title":"...","content":{"steps":[{"label":"Step name","desc":"Short desc"},{"label":"...","desc":"..."},{"label":"...","desc":"..."}]},"speaker_notes":"..."}
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
- icon_grid cards: 3 or 4 cards; heading max 30 chars; text max 80 chars
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

_FONT = "Montserrat"  # fallback; actual font comes from BrandColors.font_family


def _set_bg(slide, color: RGBColor):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = color


def _set_bg_image(slide, image_path: str):
    """Add image as slide background (covers full slide, z-order: bottom)."""
    try:
        pic = slide.shapes.add_picture(image_path, 0, 0, W, H)
        # Move the picture behind all other shapes
        spTree = slide.shapes._spTree
        spTree.remove(pic._element)
        spTree.insert(2, pic._element)  # 0=nvGrpSpPr, 1=grpSpPr, 2=first shape
    except Exception as e:
        logger.warning(f"Background image failed: {e}")


def _apply_alpha(shape, opacity: int):
    """Apply opacity (0-100) to a shape's solid fill via XML."""
    if opacity >= 100:
        return
    try:
        from pptx.oxml.ns import qn
        from lxml import etree
        solid = shape.fill._xPr.find(qn("a:solidFill"))
        if solid is None:
            return
        for clr_node in list(solid):
            for a in clr_node.findall(qn("a:alpha")):
                clr_node.remove(a)
            alpha_el = etree.SubElement(clr_node, qn("a:alpha"))
            alpha_el.set("val", str(int(opacity * 1000)))  # 100000 = fully opaque
    except Exception:
        pass


def _add_text(slide, text: str, left, top, width, height, *,
               bold=False, italic=False, size=18, font_name: str = _FONT,
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
    run.font.name = font_name
    if color:
        run.font.color.rgb = color
    return txBox


def _add_bullets(slide, items: list[str], left, top, width, height, *,
                  size=16, color: RGBColor = None, accent: RGBColor = None,
                  font_name: str = _FONT):
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_before = Pt(6)
        run = p.add_run()
        run.text = f"  \u2013  {item}"
        run.font.size = Pt(size)
        run.font.name = font_name
        if color:
            run.font.color.rgb = color
    return txBox


def _add_rect(slide, left, top, width, height, *,
               fill: RGBColor = None, line: RGBColor = None, opacity: int = 100):
    shape = slide.shapes.add_shape(1, left, top, width, height)
    if fill:
        shape.fill.solid()
        shape.fill.fore_color.rgb = fill
        _apply_alpha(shape, opacity)
    else:
        shape.fill.background()
    if line:
        shape.line.color.rgb = line
    else:
        shape.line.fill.background()
    return shape


def _add_oval(slide, left, top, width, height, *, fill: RGBColor = None, opacity: int = 100):
    shape = slide.shapes.add_shape(9, left, top, width, height)
    if fill:
        shape.fill.solid()
        shape.fill.fore_color.rgb = fill
        _apply_alpha(shape, opacity)
    else:
        shape.fill.background()
    shape.line.fill.background()
    return shape


def _add_circle_label(slide, cx, cy, r, fill: RGBColor, text: str, size: int = 16,
                       font_name: str = _FONT, opacity: int = 100):
    """Filled circle with vertically & horizontally centred text (icon replacement)."""
    shape = slide.shapes.add_shape(9, cx - r, cy - r, r * 2, r * 2)
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    _apply_alpha(shape, opacity)
    shape.line.fill.background()
    tf = shape.text_frame
    tf.word_wrap = False
    try:
        tf._txBody.bodyPr.set("anchor", "ctr")
    except Exception:
        pass
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = text
    run.font.bold = True
    run.font.size = Pt(size)
    run.font.name = font_name
    run.font.color.rgb = RGBColor(255, 255, 255)
    return shape


def _header(slide, title: str, c: BrandColors, h: float = 1.45):
    """Full-width primary header bar with white title — Gamma style."""
    _add_rect(slide, Inches(0), Inches(0), W, Inches(h),
              fill=c.shape_rgb, opacity=c.shape_opacity)
    # Thin secondary accent at bottom of header
    _add_rect(slide, Inches(0), Inches(h), W, Inches(0.055),
              fill=c.secondary_rgb, opacity=c.shape_opacity)
    _add_text(slide, title,
              Inches(0.5), Inches(0), W - Inches(0.6), Inches(h),
              bold=True, size=c.title_font_size, color=c.title_color_rgb,
              font_name=c.font_family)
    return h


# ─── Layout renderers ─────────────────────────────────────────────────────────

def _render_title_content(slide, bp: dict, c: BrandColors):
    items    = bp.get("content", {}).get("items", [])
    body_txt = bp.get("content", {}).get("text", "")

    hh = _header(slide, bp.get("title", ""), c, h=1.45)
    content_top = Inches(hh + 0.15)

    if items:
        _add_bullets(slide, items, Inches(0.55), content_top, W - Inches(0.75), H - content_top - Inches(0.2),
                     size=c.body_font_size, color=c.text_body_rgb, font_name=c.font_family)
    elif body_txt:
        _add_text(slide, body_txt, Inches(0.55), content_top, W - Inches(0.75), H - content_top - Inches(0.2),
                  size=c.body_font_size, color=c.text_body_rgb, font_name=c.font_family)


def _render_two_column(slide, bp: dict, c: BrandColors):
    lc = bp.get("content", {}).get("left",  {})
    rc = bp.get("content", {}).get("right", {})

    hh = _header(slide, bp.get("title", ""), c, h=1.3)
    col_top = Inches(hh + 0.2)
    col_h   = H - col_top - Inches(0.2)
    col_w   = (W - Inches(0.5)) / 2 - Inches(0.15)
    lx = Inches(0.35)
    rx = Inches(0.35) + col_w + Inches(0.3)

    # Vertical divider
    _add_rect(slide, W / 2 - Inches(0.025), col_top, Inches(0.05), col_h,
              fill=c.divider_rgb, opacity=c.shape_opacity)

    if lc.get("heading"):
        _add_text(slide, lc["heading"], lx, col_top, col_w, Inches(0.6),
                  bold=True, size=16, color=c.shape_rgb, font_name=c.font_family)
    if lc.get("items"):
        _add_bullets(slide, lc["items"], lx, col_top + Inches(0.65), col_w, col_h - Inches(0.7),
                     size=c.body_font_size - 3, color=c.text_body_rgb, font_name=c.font_family)

    if rc.get("heading"):
        _add_text(slide, rc["heading"], rx, col_top, col_w, Inches(0.6),
                  bold=True, size=16, color=c.shape_rgb, font_name=c.font_family)
    if rc.get("items"):
        _add_bullets(slide, rc["items"], rx, col_top + Inches(0.65), col_w, col_h - Inches(0.7),
                     size=c.body_font_size - 3, color=c.text_body_rgb, font_name=c.font_family)


def _render_big_stat(slide, bp: dict, c: BrandColors):
    content = bp.get("content", {})

    hh = _header(slide, bp.get("title", ""), c, h=1.1)
    # Huge value
    _add_text(slide, content.get("value", ""),
              Inches(0.5), Inches(hh + 0.05), Inches(7), Inches(3.5),
              bold=True, size=100, color=c.shape_rgb, word_wrap=False, font_name=c.font_family)
    # Label under value
    _add_text(slide, content.get("label", ""),
              Inches(0.5), Inches(hh + 3.6), Inches(6), Inches(0.75),
              size=22, color=c.text_muted_rgb, font_name=c.font_family)

    ctx = content.get("context", [])
    if ctx:
        _add_rect(slide, Inches(7.6), Inches(hh + 0.15), Inches(0.05), H - Inches(hh + 0.35),
                  fill=c.divider_rgb, opacity=c.shape_opacity)
        _add_bullets(slide, ctx, Inches(7.85), Inches(hh + 0.4), Inches(5.1), H - Inches(hh + 0.6),
                     size=c.body_font_size - 1, color=c.text_body_rgb, font_name=c.font_family)


def _render_section_divider(slide, bp: dict, c: BrandColors):
    _set_bg(slide, c.shape_rgb)

    # Decorative large circle (upper-right, partially off-screen — lighter shade)
    r_big = Inches(4.0)
    pr, pg, pb = c.shape_rgb[0], c.shape_rgb[1], c.shape_rgb[2]
    _add_oval(slide, W - r_big * 0.8, -r_big * 0.6, r_big * 2, r_big * 2,
              fill=RGBColor(min(255, pr + 28), min(255, pg + 28), min(255, pb + 38)),
              opacity=c.shape_opacity)

    # Thin accent bar at top
    _add_rect(slide, Inches(0), Inches(0), W, Inches(0.12),
              fill=c.secondary_rgb, opacity=c.shape_opacity)

    # Title — bold, white, left-aligned (Gamma style)
    _add_text(slide, bp.get("title", ""),
              Inches(0.75), Inches(1.6), W - Inches(5.0), Inches(3.2),
              bold=True, size=c.title_font_size + 22, color=c.title_color_rgb,
              font_name=c.font_family)

    subtitle = bp.get("content", {}).get("subtitle", "")
    if subtitle:
        _add_rect(slide, Inches(0.75), Inches(5.0), Inches(1.8), Inches(0.06),
                  fill=c.secondary_rgb, opacity=c.shape_opacity)
        _add_text(slide, subtitle,
                  Inches(0.75), Inches(5.15), W - Inches(5.5), Inches(1.2),
                  size=c.body_font_size + 4, color=RGBColor(210, 225, 255),
                  font_name=c.font_family)

    # Thin accent bar at bottom
    _add_rect(slide, Inches(0), H - Inches(0.12), W, Inches(0.12),
              fill=c.secondary_rgb, opacity=c.shape_opacity)


def _render_quote(slide, bp: dict, c: BrandColors):
    content = bp.get("content", {})
    _set_bg(slide, c.shape_rgb)

    # Decorative circle accent (slightly lighter shade)
    pr, pg, pb = c.shape_rgb[0], c.shape_rgb[1], c.shape_rgb[2]
    _add_oval(slide, W - Inches(3.5), H - Inches(3.5), Inches(5), Inches(5),
              fill=RGBColor(min(255, pr + 22), min(255, pg + 22), min(255, pb + 32)),
              opacity=c.shape_opacity)

    # Large opening quote mark
    _add_text(slide, "\u201C",
              Inches(0.5), Inches(0.0), Inches(3), Inches(3),
              bold=True, size=130, color=c.title_color_rgb, word_wrap=False,
              font_name=c.font_family)

    _add_text(slide, content.get("quote", ""),
              Inches(0.85), Inches(1.3), W - Inches(1.8), Inches(4.0),
              size=c.body_font_size + 8, color=c.title_color_rgb, font_name=c.font_family)

    if content.get("attribution"):
        _add_rect(slide, Inches(0.85), Inches(5.45), Inches(2.0), Inches(0.06),
                  fill=c.secondary_rgb, opacity=c.shape_opacity)
        _add_text(slide, f"\u2014 {content['attribution']}",
                  Inches(0.85), Inches(5.6), W - Inches(1.8), Inches(0.8),
                  size=16, italic=True, color=RGBColor(200, 220, 255),
                  font_name=c.font_family)


def _render_comparison(slide, bp: dict, c: BrandColors):
    lc = bp.get("content", {}).get("left",  {})
    rc = bp.get("content", {}).get("right", {})

    hh = _header(slide, bp.get("title", ""), c, h=1.2)
    panel_top = Inches(hh + 0.12)
    pw  = (W - Inches(0.5)) / 2 - Inches(0.1)
    ph  = H - panel_top - Inches(0.2)
    lx  = Inches(0.25)
    rx  = lx + pw + Inches(0.2)

    # Left panel
    _add_rect(slide, lx, panel_top, pw, ph, fill=c.accent_light_rgb)
    _add_rect(slide, lx, panel_top, pw, Inches(0.52),
              fill=c.shape_rgb, opacity=c.shape_opacity)
    _add_text(slide, lc.get("label", ""),
              lx + Inches(0.15), panel_top + Inches(0.06), pw - Inches(0.3), Inches(0.44),
              bold=True, size=16, color=c.title_color_rgb, align=PP_ALIGN.CENTER,
              font_name=c.font_family)
    if lc.get("items"):
        _add_bullets(slide, lc["items"], lx + Inches(0.2), panel_top + Inches(0.65),
                     pw - Inches(0.35), ph - Inches(0.8), size=c.body_font_size - 4,
                     color=c.text_body_rgb, font_name=c.font_family)

    # Right panel
    _add_rect(slide, rx, panel_top, pw, ph, fill=RGBColor(240, 253, 244))
    _add_rect(slide, rx, panel_top, pw, Inches(0.52),
              fill=c.secondary_rgb, opacity=c.shape_opacity)
    _add_text(slide, rc.get("label", ""),
              rx + Inches(0.15), panel_top + Inches(0.06), pw - Inches(0.3), Inches(0.44),
              bold=True, size=16, color=c.title_color_rgb, align=PP_ALIGN.CENTER,
              font_name=c.font_family)
    if rc.get("items"):
        _add_bullets(slide, rc["items"], rx + Inches(0.2), panel_top + Inches(0.65),
                     pw - Inches(0.35), ph - Inches(0.8), size=c.body_font_size - 4,
                     color=c.text_body_rgb, font_name=c.font_family)


def _render_timeline(slide, bp: dict, c: BrandColors):
    steps = bp.get("content", {}).get("steps", [])[:5]

    hh = _header(slide, bp.get("title", ""), c, h=1.3)

    if not steps:
        return

    n      = len(steps)
    line_y = Inches(3.8)
    x0     = Inches(0.8)
    x1     = W - Inches(0.6)
    step_w = (x1 - x0) / n

    # Horizontal axis line
    _add_rect(slide, x0, line_y - Inches(0.03), x1 - x0, Inches(0.07),
              fill=c.shape_rgb, opacity=c.shape_opacity)

    for i, step in enumerate(steps):
        cx = x0 + step_w * i + step_w / 2
        r  = Inches(0.28)

        # Circle dot on axis
        _add_circle_label(slide, cx, line_y, r, c.shape_rgb, str(i + 1), size=13,
                          font_name=c.font_family, opacity=c.shape_opacity)

        # Label above
        _add_text(slide, step.get("label", ""),
                  cx - step_w / 2 + Inches(0.05), Inches(hh + 0.1), step_w - Inches(0.1), Inches(0.7),
                  bold=True, size=13, color=c.shape_rgb, align=PP_ALIGN.CENTER, font_name=c.font_family)

        # Event below
        _add_text(slide, step.get("event", ""),
                  cx - step_w / 2 + Inches(0.05), line_y + Inches(0.55), step_w - Inches(0.1), Inches(2.5),
                  size=12, color=c.text_body_rgb, align=PP_ALIGN.CENTER, word_wrap=True,
                  font_name=c.font_family)


# ─── New visual layout renderers ──────────────────────────────────────────────

def _render_icon_grid(slide, bp: dict, c: BrandColors):
    """3 or 4 cards, each with a numbered icon circle + heading + short text."""
    cards = bp.get("content", {}).get("cards", [])[:4]
    if not cards:
        _render_title_content(slide, bp, c)
        return

    hh = _header(slide, bp.get("title", ""), c, h=1.35)

    n       = len(cards)
    cols    = 2 if n > 2 else n
    rows    = (n + cols - 1) // cols
    pad     = Inches(0.22)
    x0      = Inches(0.3)
    y0      = Inches(hh + 0.15)
    avail_w = W - x0 - Inches(0.25)
    avail_h = H - y0 - Inches(0.15)
    card_w  = (avail_w - pad * (cols - 1)) / cols
    card_h  = (avail_h - pad * (rows - 1)) / rows

    # Icon circle palette — rotate through accent shades
    icon_colors = [
        c.shape_rgb, c.secondary_rgb,
        RGBColor(99, 102, 241), RGBColor(20, 184, 166),
    ]

    for i, card in enumerate(cards):
        row = i // cols
        col = i % cols
        cx  = x0 + col * (card_w + pad)
        cy  = y0 + row * (card_h + pad)

        # Card background (white) + top colored border
        _add_rect(slide, cx, cy, card_w, card_h, fill=RGBColor(255, 255, 255))
        _add_rect(slide, cx, cy, card_w, Inches(0.065),
                  fill=icon_colors[i % len(icon_colors)], opacity=c.shape_opacity)

        # Icon circle
        r_icon = Inches(0.32)
        icon_cx = cx + r_icon + Inches(0.18)
        icon_cy = cy + r_icon + Inches(0.2)
        _add_circle_label(slide, icon_cx, icon_cy, r_icon,
                          icon_colors[i % len(icon_colors)], str(i + 1), size=15,
                          font_name=c.font_family, opacity=c.shape_opacity)

        # Heading — to the right of icon
        _add_text(slide, card.get("heading", ""),
                  cx + r_icon * 2 + Inches(0.35), cy + Inches(0.15),
                  card_w - r_icon * 2 - Inches(0.45), Inches(0.65),
                  bold=True, size=14, color=c.text_rgb, font_name=c.font_family)

        # Body text
        _add_text(slide, card.get("text", ""),
                  cx + Inches(0.15), cy + r_icon * 2 + Inches(0.35),
                  card_w - Inches(0.3), card_h - r_icon * 2 - Inches(0.5),
                  size=12, color=c.text_muted_rgb, font_name=c.font_family)


def _render_key_message(slide, bp: dict, c: BrandColors):
    """One powerful statement dominates the slide — Gamma big-impact style."""
    content = bp.get("content", {})
    message = content.get("message", bp.get("title", ""))
    subtext = content.get("subtext", "")
    label   = bp.get("title", "")

    _set_bg(slide, RGBColor(255, 255, 255))

    # Thin accent bar at top
    _add_rect(slide, Inches(0), Inches(0), W, Inches(0.12),
              fill=c.shape_rgb, opacity=c.shape_opacity)
    # Thin accent bar at bottom
    _add_rect(slide, Inches(0), H - Inches(0.12), W, Inches(0.12),
              fill=c.secondary_rgb, opacity=c.shape_opacity)

    # Small eyebrow label
    if label and label != message:
        _add_text(slide, label.upper(),
                  Inches(0.7), Inches(0.35), W - Inches(1.0), Inches(0.55),
                  size=11, color=c.text_muted_rgb, font_name=c.font_family)

    # Huge message
    _add_text(slide, message,
              Inches(0.7), Inches(1.0), W - Inches(1.1), Inches(4.5),
              bold=True, size=44, color=c.shape_rgb, font_name=c.font_family)

    # Subtext
    if subtext:
        _add_rect(slide, Inches(0.7), Inches(5.7), Inches(1.8), Inches(0.06),
                  fill=c.secondary_rgb, opacity=c.shape_opacity)
        _add_text(slide, subtext,
                  Inches(0.7), Inches(5.85), W - Inches(1.1), Inches(0.9),
                  size=c.body_font_size - 2, color=c.text_muted_rgb, italic=True,
                  font_name=c.font_family)


def _render_process_flow(slide, bp: dict, c: BrandColors):
    """Horizontal numbered steps with label and description — no emoji."""
    steps = bp.get("content", {}).get("steps", [])[:5]
    if not steps:
        _render_title_content(slide, bp, c)
        return

    hh = _header(slide, bp.get("title", ""), c, h=1.3)

    n       = len(steps)
    x0      = Inches(0.35)
    x1      = W - Inches(0.2)
    step_w  = (x1 - x0) / n
    circle_y = Inches(3.2)
    r        = Inches(0.42)

    # Connecting line
    _add_rect(slide, x0 + r, circle_y - Inches(0.03), x1 - x0 - r * 2, Inches(0.06),
              fill=c.divider_rgb, opacity=c.shape_opacity)

    # Step number accent colors
    step_colors = [c.shape_rgb, c.secondary_rgb,
                   RGBColor(99, 102, 241), RGBColor(20, 184, 166), c.shape_rgb]

    for i, step in enumerate(steps):
        cx = x0 + step_w * i + step_w / 2

        # Numbered circle
        _add_circle_label(slide, cx, circle_y, r, step_colors[i % len(step_colors)], str(i + 1), size=17,
                          font_name=c.font_family, opacity=c.shape_opacity)

        # Label below circle
        _add_text(slide, step.get("label", ""),
                  cx - step_w / 2 + Inches(0.05), circle_y + r + Inches(0.18),
                  step_w - Inches(0.1), Inches(0.65),
                  bold=True, size=13, color=c.text_rgb, align=PP_ALIGN.CENTER, font_name=c.font_family)

        # Description
        _add_text(slide, step.get("desc", ""),
                  cx - step_w / 2 + Inches(0.05), circle_y + r + Inches(0.9),
                  step_w - Inches(0.1), Inches(2.2),
                  size=12, color=c.text_muted_rgb, align=PP_ALIGN.CENTER, word_wrap=True,
                  font_name=c.font_family)

        # Arrow connector (except last)
        if i < n - 1:
            _add_text(slide, "›",
                      cx + step_w / 2 - Inches(0.15), circle_y - Inches(0.25),
                      Inches(0.35), Inches(0.9),
                      size=26, color=c.secondary_rgb, align=PP_ALIGN.CENTER, font_name=c.font_family)


def _render_chart_bar(slide, bp: dict, c: BrandColors):
    """Column chart using python-pptx Charts API — Gamma style header."""
    content     = bp.get("content", {})
    categories  = content.get("categories", [])
    series_data = content.get("series", [])

    hh = _header(slide, bp.get("title", ""), c, h=1.3)

    if not categories or not series_data:
        return

    try:
        chart_data = ChartData()
        chart_data.categories = categories
        for s in series_data:
            chart_data.add_series(s.get("name", ""), tuple(s.get("values", [])))

        chart_frame = slide.shapes.add_chart(
            XL_CHART_TYPE.COLUMN_CLUSTERED,
            Inches(0.4), Inches(hh + 0.1), W - Inches(0.6), H - Inches(hh + 0.3),
            chart_data
        )
        chart = chart_frame.chart
        chart.has_legend = len(series_data) > 1

        plot = chart.plots[0]
        for i, series in enumerate(plot.series):
            fill = series.format.fill
            fill.solid()
            fill.fore_color.rgb = c.primary_rgb if i == 0 else c.secondary_rgb

        chart.category_axis.tick_labels.font.size = Pt(11)
        chart.category_axis.tick_labels.font.name = _FONT
        chart.value_axis.tick_labels.font.size = Pt(11)
        chart.value_axis.tick_labels.font.name = _FONT
        chart.chart_style = 2
    except Exception as e:
        logger.warning(f"chart_bar render failed: {e}")
        _render_title_content(slide, {
            **bp,
            "content": {"type": "bullets", "items": [
                f"{cat}: {s.get('values', [])[i] if i < len(s.get('values', [])) else '?'}"
                for s in series_data
                for i, cat in enumerate(categories)
            ][:6]}
        }, c)


def _render_chart_pie(slide, bp: dict, c: BrandColors):
    """Pie chart using python-pptx Charts API — Gamma style header."""
    content = bp.get("content", {})
    slices  = content.get("slices", [])

    hh = _header(slide, bp.get("title", ""), c, h=1.3)

    if not slices:
        return

    try:
        chart_data = ChartData()
        chart_data.categories = [s.get("label", f"Item {i+1}") for i, s in enumerate(slices)]
        chart_data.add_series("", tuple(s.get("value", 0) for s in slices))

        chart_frame = slide.shapes.add_chart(
            XL_CHART_TYPE.PIE,
            Inches(0.4), Inches(hh + 0.1), W - Inches(0.6), H - Inches(hh + 0.3),
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
        items = [f"{s.get('label', '?')}: {s.get('value', '?')}%" for s in slices]
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
    # Background: image takes priority, then solid color from master, then white
    if colors.background_image_path and os.path.exists(colors.background_image_path):
        _set_bg_image(slide, colors.background_image_path)
    elif layout != "section_divider" and layout != "quote" and not template_pptx_path:
        _set_bg(slide, RGBColor(255, 255, 255))

    renderer = _RENDERERS.get(layout, _render_title_content)
    renderer(slide, blueprint, colors)
    return prs


# ─── Thumbnail ───────────────────────────────────────────────────────────────

def _find_libreoffice() -> str:
    """Find the LibreOffice binary on macOS or Linux."""
    candidates = [
        "libreoffice",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "/usr/bin/libreoffice",
        "/usr/bin/soffice",
    ]
    for c in candidates:
        if subprocess.run(["which", c], capture_output=True).returncode == 0:
            return c
        if Path(c).exists():
            return c
    return "libreoffice"


def _render_thumbnail(pptx_path: str, out_dir: str) -> str | None:
    """PPTX → PDF via LibreOffice → PNG via PyMuPDF."""
    try:
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(
                [_find_libreoffice(), "--headless", "--convert-to", "pdf",
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
                                           if k in BrandColors.__dataclass_fields__})
                else:
                    colors = _extract_brand_colors(template_pptx_path)

            # Apply strict brand guidelines (override extracted colors)
            if tmpl.font_family:
                colors.font_family = tmpl.font_family
            if tmpl.title_font_color:
                colors.title_font_color = tmpl.title_font_color
            if tmpl.title_font_size:
                colors.title_font_size = tmpl.title_font_size
            if tmpl.body_font_color:
                colors.body_font_color = tmpl.body_font_color
            if tmpl.body_font_size:
                colors.body_font_size = tmpl.body_font_size
            if tmpl.shape_color:
                colors.shape_color = tmpl.shape_color
                colors.primary = tmpl.shape_color  # sync primary for charts/legends
            if tmpl.shape_opacity is not None:
                colors.shape_opacity = tmpl.shape_opacity
            if tmpl.background_image_path and os.path.exists(tmpl.background_image_path):
                colors.background_image_path = tmpl.background_image_path

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


async def save_slide_from_blueprint(
    db: Session,
    blueprint: dict,
    colors: "BrandColors",
    template_pptx_path: str | None,
    user_id: int | None,
    slide_index: int = 0,
) -> "SlideLibraryEntry":
    """
    Render a pre-made blueprint → save as SlideLibraryEntry with thumbnail.
    Skips AI generation (blueprint already provided).
    """
    blueprint.setdefault("layout", "title_content")
    blueprint.setdefault("title", "")
    blueprint.setdefault("content", {})

    title = (blueprint.get("title") or "")[:80]

    # 1. Render PPTX
    prs = render_slide_pptx(blueprint, colors, template_pptx_path)

    # 2. Save PPTX
    gen_dir = Path(settings.upload_dir) / "generated"
    gen_dir.mkdir(parents=True, exist_ok=True)
    pptx_path = str(gen_dir / f"gen_{uuid.uuid4()}.pptx")
    prs.save(pptx_path)

    # 3. SourcePresentation record
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

    # 4. Thumbnail
    thumb_dir = Path(settings.thumbnail_dir) / str(source.id)
    thumb_dir.mkdir(parents=True, exist_ok=True)
    thumb_abs = _render_thumbnail(pptx_path, str(thumb_dir))

    if not thumb_abs:
        from services.thumbnail import _make_placeholder_thumbnail
        data = _make_placeholder_thumbnail(title, 0)
        thumb_abs = str(thumb_dir / "0.png")
        Path(thumb_abs).write_bytes(data)

    thumbnail_path = f"{source.id}/0.png"

    # 5. XML blob
    xml_blob: str | None = None
    try:
        from lxml import etree
        prs2 = Presentation(pptx_path)
        if prs2.slides:
            xml_blob = etree.tostring(prs2.slides[0]._element, encoding="unicode")
    except Exception:
        pass

    # 6. Embedding
    summary   = _blueprint_to_summary(blueprint)
    tags      = _blueprint_to_tags(blueprint)
    embedding: list[float] | None = None
    try:
        from services.embedding import build_slide_embed_text
        embed_text = build_slide_embed_text(title, summary, tags)
        embedding  = await embed_single(embed_text)
    except Exception as e:
        logger.warning(f"Embedding failed: {e}")

    # 7. Save SlideLibraryEntry
    entry = SlideLibraryEntry(
        source_id      = source.id,
        slide_index    = slide_index,
        thumbnail_path = thumbnail_path,
        xml_blob       = xml_blob,
        title          = title,
        summary        = summary,
        tags_json      = json.dumps(tags, ensure_ascii=False),
        layout_type    = blueprint.get("layout", "title_content"),
        language       = _detect_language(title),
        embedding_json = json.dumps(embedding) if embedding else None,
        has_media      = False,
        is_generated   = True,
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
