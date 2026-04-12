"""
Brand context loader — maps a BrandTemplate DB row to a BrandContext schema.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from sqlalchemy.orm import Session

from models.brand import BrandTemplate
from schemas.brand_context import BrandContext, ZoneRect

logger = logging.getLogger(__name__)


def load_brand_context(template_id: int, db: Session) -> Optional[BrandContext]:
    """
    Load a BrandTemplate row by ID and return a populated BrandContext.
    Returns None if the template is not found.
    """
    tmpl: Optional[BrandTemplate] = db.query(BrandTemplate).filter(
        BrandTemplate.id == template_id
    ).first()

    if tmpl is None:
        logger.warning("BrandTemplate id=%s not found", template_id)
        return None

    # Parse colors_json: {"primary": "...", "secondary": "...", ...}
    colors: dict = {}
    if tmpl.colors_json:
        try:
            colors = json.loads(tmpl.colors_json)
        except Exception:
            pass

    # Parse prohibitions_json: JSON array of strings, or a raw string fallback
    prohibitions: list[str] = []
    if tmpl.prohibitions_json:
        try:
            parsed = json.loads(tmpl.prohibitions_json)
            if isinstance(parsed, list):
                prohibitions = [str(p) for p in parsed]
            else:
                prohibitions = [str(parsed)]
        except Exception:
            prohibitions = [tmpl.prohibitions_json]

    return BrandContext(
        template_id=template_id,
        pptx_path=tmpl.pptx_path,

        # Colors — prefer dedicated columns, fall back to colors_json keys
        primary_color=tmpl.shape_color or colors.get("primary"),
        secondary_color=colors.get("secondary"),
        accent_color=colors.get("accent"),
        title_color=tmpl.title_font_color,
        body_color=tmpl.body_font_color,

        font_family=tmpl.font_family,

        tone_of_voice=tmpl.tone_of_voice,
        prohibitions=prohibitions,
        target_audience=tmpl.target_audience,
        brand_guidelines_text=tmpl.brand_guidelines_text,

        title_zone=ZoneRect(
            x=tmpl.title_x,
            y=tmpl.title_y,
            w=tmpl.title_w,
            h=tmpl.title_h,
        ),
        body_zone=ZoneRect(
            x=tmpl.body_x,
            y=tmpl.body_y,
            w=tmpl.body_w,
            h=tmpl.body_h,
        ),
    )
