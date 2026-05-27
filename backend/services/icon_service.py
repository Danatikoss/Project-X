"""
Icon service — resolves Lucide icon names to PNG bytes with a given color.
"""
import logging
from pathlib import Path

import cairosvg

ICONS_DIR = Path(__file__).parent.parent / "data" / "icons" / "lucide"

logger = logging.getLogger(__name__)


def _load_svg(name: str) -> str | None:
    """Load SVG source by icon name (with or without .svg extension)."""
    clean = name.strip().lower().replace("_", "-").removesuffix(".svg")
    path = ICONS_DIR / f"{clean}.svg"
    if path.exists():
        return path.read_text(encoding="utf-8")

    # Fuzzy fallback: find the closest match by prefix
    matches = list(ICONS_DIR.glob(f"{clean}*.svg"))
    if matches:
        logger.debug("Icon %r not found exactly, using %s", name, matches[0].name)
        return matches[0].read_text(encoding="utf-8")

    logger.warning("Icon %r not found in Lucide library", name)
    return None


def icon_to_png(name: str, color: str = "#FFFFFF", size: int = 256) -> bytes | None:
    """
    Convert a Lucide icon to PNG bytes.

    Args:
        name:  Lucide icon name (e.g. "bar-chart", "globe", "star")
        color: Hex color string (e.g. "#FFFFFF", "#1A73E8")
        size:  Output size in pixels (square)

    Returns:
        PNG bytes, or None if icon not found.
    """
    svg_src = _load_svg(name)
    if svg_src is None:
        return None

    # Apply color: replace currentColor with requested color
    colored = svg_src.replace("currentColor", color)

    png_bytes = cairosvg.svg2png(
        bytestring=colored.encode("utf-8"),
        output_width=size,
        output_height=size,
    )
    return png_bytes


def list_icons() -> list[str]:
    """Return all available icon names (without .svg extension)."""
    return sorted(p.stem for p in ICONS_DIR.glob("*.svg"))
