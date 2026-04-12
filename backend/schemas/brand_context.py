"""
BrandContext — structured brand data passed to LLM prompts.
"""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel


class ZoneRect(BaseModel):
    x: float
    y: float
    w: float
    h: float


class BrandContext(BaseModel):
    # Template identity
    template_id: int
    pptx_path: Optional[str] = None

    # Colors (hex without #)
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    accent_color: Optional[str] = None
    title_color: Optional[str] = None
    body_color: Optional[str] = None

    # Typography
    font_family: Optional[str] = None

    # Brand voice
    tone_of_voice: Optional[str] = None
    prohibitions: list[str] = []
    target_audience: Optional[str] = None
    brand_guidelines_text: Optional[str] = None

    # Layout zones (fractions of slide dimensions)
    title_zone: Optional[ZoneRect] = None
    body_zone: Optional[ZoneRect] = None

    def to_prompt_string(self) -> str:
        """Return a formatted string suitable for injection into an LLM prompt."""
        lines: list[str] = []

        if self.tone_of_voice:
            lines.append(f"Tone of voice: {self.tone_of_voice}")
        if self.target_audience:
            lines.append(f"Target audience: {self.target_audience}")
        if self.prohibitions:
            lines.append(f"Prohibitions: {'; '.join(self.prohibitions)}")
        if self.brand_guidelines_text:
            lines.append(f"Brand guidelines: {self.brand_guidelines_text}")
        if self.font_family:
            lines.append(f"Font: {self.font_family}")
        if self.primary_color:
            lines.append(f"Primary color: #{self.primary_color}")
        if self.secondary_color:
            lines.append(f"Secondary color: #{self.secondary_color}")
        if self.accent_color:
            lines.append(f"Accent color: #{self.accent_color}")
        if self.title_color:
            lines.append(f"Title color: #{self.title_color}")
        if self.body_color:
            lines.append(f"Body color: #{self.body_color}")

        return "\n".join(lines)
