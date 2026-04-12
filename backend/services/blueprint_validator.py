"""
Blueprint validator — runs BEFORE python-pptx rendering to catch LLM overflows.

Pure Python, no LLM calls, O(1).  Each layout has hard character/count limits
calibrated to the template's placeholder dimensions (10" × 5.625" slide canvas,
~72 pt body font, title bar occupying top ~18% of the slide height).

Guiding principle: placeholder boundaries are FIXED — text that doesn't fit is
silently truncated here rather than overflowing at render time.
"""

from __future__ import annotations


# ─── Per-layout constraints ────────────────────────────────────────────────────
#
# All limits are calibrated to the template slide canvas (10" × 5.625").
# Body placeholder ≈ 8" wide × 4" tall at ~16pt body font → ~40 chars/line,
# ~18-20 lines max.  Stricter limits here prevent visual overflow.

_CONSTRAINTS: dict[str, dict] = {
    "icon_grid": {
        "cards_max": 4,
        "heading_chars": 28,   # ≈ one line at 18pt bold
        "text_chars":    80,   # ≈ 2 lines at 14pt
    },
    "process_flow": {
        "steps_max":   5,
        "label_chars": 22,     # step label: fits on one bold line
        "desc_chars":  55,     # description: ≈ 1.5 lines
    },
    "timeline": {
        "steps_max":   5,
        "label_chars": 18,
        "event_chars": 70,
    },
    "key_message": {
        "message_words": 12,   # hero text — brevity = impact
        "subtext_chars": 120,
    },
    "big_stat": {
        "value_chars":        10,  # the big number (e.g. "$1.2B")
        "label_chars":        50,
        "context_items":       3,
        "context_item_chars": 80,
    },
    "title_content": {
        "items_max":  5,
        "item_chars": 90,      # ≈ 2 lines per bullet at 16pt
    },
    "two_column": {
        "heading_chars": 35,
        "items_max":      6,
        "item_chars":    80,
    },
    "comparison": {
        "label_chars": 35,
        "items_max":    5,
        "item_chars":  80,
    },
    "quote": {
        "quote_chars":       180,
        "attribution_chars":  60,
    },
    "section_divider": {
        "subtitle_chars": 100,
    },
    "chart_bar": {
        "categories_max":    7,
        "category_chars":   18,
        "series_max":        3,
        "series_name_chars": 25,
    },
    "chart_pie": {
        "slices_max":  6,
        "label_chars": 22,
    },
    "metrics_grid": {
        "metrics_max":    8,
        "metrics_min":    3,
        "value_chars":   15,   # e.g. "26 млн", "#1 среди СНГ"
        "label_chars":   40,   # max 5 words ≈ 40 chars
        "sublabel_chars": 60,
    },
    # section_divider (scratch render) — title only, no content to trim
}

_TITLE_MAX = 55            # title placeholder is narrower than full slide width
_SPEAKER_NOTES_MAX = 500


def _trim(s: object, max_chars: int) -> str:
    text = str(s or "")
    if len(text) > max_chars:
        return text[: max_chars - 1] + "…"
    return text


def validate_and_trim(bp: dict) -> dict:
    """
    Trim text fields and cap list lengths according to layout-specific limits.
    Mutates *bp* in-place and returns it for chaining.
    Never raises — always returns a renderable blueprint.
    """
    layout: str = bp.get("layout", "title_content")
    c: dict = bp.get("content") or {}

    # Global caps
    bp["title"] = _trim(bp.get("title", ""), _TITLE_MAX)
    bp["speaker_notes"] = _trim(bp.get("speaker_notes", ""), _SPEAKER_NOTES_MAX)

    lim = _CONSTRAINTS.get(layout, {})

    if layout == "icon_grid":
        cards = (c.get("cards") or [])[:lim["cards_max"]]
        c["cards"] = [
            {
                "heading": _trim(card.get("heading", ""), lim["heading_chars"]),
                "text":    _trim(card.get("text", ""),    lim["text_chars"]),
            }
            for card in cards
        ]

    elif layout == "process_flow":
        steps = (c.get("steps") or [])[:lim["steps_max"]]
        c["steps"] = [
            {
                "label": _trim(s.get("label", ""), lim["label_chars"]),
                "desc":  _trim(s.get("desc",  ""), lim["desc_chars"]),
            }
            for s in steps
        ]

    elif layout == "timeline":
        steps = (c.get("steps") or [])[:lim["steps_max"]]
        c["steps"] = [
            {
                "label": _trim(s.get("label", ""), lim["label_chars"]),
                "event": _trim(s.get("event", ""), lim["event_chars"]),
            }
            for s in steps
        ]

    elif layout == "key_message":
        words = (c.get("message") or "").split()
        max_w = lim["message_words"]
        c["message"] = (" ".join(words[:max_w]) + ("…" if len(words) > max_w else ""))
        c["subtext"] = _trim(c.get("subtext", ""), lim["subtext_chars"])

    elif layout == "big_stat":
        c["value"]   = _trim(c.get("value", ""),  lim["value_chars"])
        c["label"]   = _trim(c.get("label", ""),  lim["label_chars"])
        ctx          = (c.get("context") or [])[:lim["context_items"]]
        c["context"] = [_trim(item, lim["context_item_chars"]) for item in ctx]

    elif layout == "title_content":
        items      = (c.get("items") or [])[:lim["items_max"]]
        c["items"] = [_trim(item, lim["item_chars"]) for item in items]

    elif layout == "two_column":
        for side in ("left", "right"):
            panel = c.get(side) or {}
            panel["heading"] = _trim(panel.get("heading", ""), lim["heading_chars"])
            items            = (panel.get("items") or [])[:lim["items_max"]]
            panel["items"]   = [_trim(i, lim["item_chars"]) for i in items]
            c[side]          = panel

    elif layout == "comparison":
        for side in ("left", "right"):
            panel = c.get(side) or {}
            panel["label"] = _trim(panel.get("label", ""), lim["label_chars"])
            items          = (panel.get("items") or [])[:lim["items_max"]]
            panel["items"] = [_trim(i, lim["item_chars"]) for i in items]
            c[side]        = panel

    elif layout == "quote":
        c["quote"]       = _trim(c.get("quote", ""),       lim["quote_chars"])
        c["attribution"] = _trim(c.get("attribution", ""), lim["attribution_chars"])

    elif layout == "section_divider":
        c["subtitle"] = _trim(c.get("subtitle", ""), lim["subtitle_chars"])

    elif layout == "chart_bar":
        cats         = (c.get("categories") or [])[:lim["categories_max"]]
        c["categories"] = [_trim(cat, lim["category_chars"]) for cat in cats]
        series       = (c.get("series") or [])[:lim["series_max"]]
        n_cats       = len(cats)
        c["series"]  = [
            {
                "name":   _trim(s.get("name", ""), lim["series_name_chars"]),
                "values": (s.get("values") or [])[:n_cats],
            }
            for s in series
        ]

    elif layout == "chart_pie":
        slices      = (c.get("slices") or [])[:lim["slices_max"]]
        c["slices"] = [
            {
                "label": _trim(s.get("label", ""), lim["label_chars"]),
                "value": float(s.get("value") or 0),
            }
            for s in slices
        ]

    elif layout == "metrics_grid":
        metrics = (c.get("metrics") or [])[:lim["metrics_max"]]
        c["metrics"] = [
            {
                "value":    _trim(m.get("value", ""),    lim["value_chars"]),
                "label":    _trim(m.get("label", ""),    lim["label_chars"]),
                "sublabel": _trim(m.get("sublabel") or "", lim["sublabel_chars"]) or None,
            }
            for m in metrics
        ]
        # Enforce minimum — pad with placeholders rather than render an empty grid
        while len(c["metrics"]) < lim["metrics_min"]:
            c["metrics"].append({"value": "—", "label": "", "sublabel": None})

    bp["content"] = c
    return bp
