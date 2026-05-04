"""
Template Library — loads the slide template catalog and selects the best template
for a given content scenario using keyword/tag matching.
"""
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

CATALOG_PATH = Path(__file__).parent.parent / "slide_templates" / "catalog.json"
TEMPLATES_DIR = Path(__file__).parent.parent / "slide_templates"


@dataclass
class TemplateInfo:
    id: str
    slide_index: int
    name: str
    description: str
    scenario_tags: list[str]
    slots: dict[str, str]
    pptx_file: str = "Libraryslides.pptx"
    theme: str = "default"
    layout_role: str = "content"  # "title" | "content"
    ai_description: str = ""
    embedding: list = None

    def __post_init__(self):
        if self.embedding is None:
            self.embedding = []

    @property
    def pptx_path(self) -> Path:
        return TEMPLATES_DIR / self.pptx_file


def load_catalog() -> list[TemplateInfo]:
    with open(CATALOG_PATH, encoding="utf-8") as f:
        raw = json.load(f)
    # Strip unknown fields so old catalog entries without 'theme' load fine
    known = {f.name for f in TemplateInfo.__dataclass_fields__.values()}
    return [TemplateInfo(**{k: v for k, v in entry.items() if k in known}) for entry in raw]


def list_themes(catalog: Optional[list[TemplateInfo]] = None) -> list[str]:
    """Return sorted list of distinct themes present in the catalog."""
    if catalog is None:
        catalog = load_catalog()
    return sorted({t.theme for t in catalog})


def get_title_slides(theme: str = "default", catalog: Optional[list[TemplateInfo]] = None) -> list[TemplateInfo]:
    """Return all title slides for a given theme."""
    if catalog is None:
        catalog = load_catalog()
    return [t for t in catalog if t.layout_role == "title" and t.theme == theme]


def get_content_catalog(theme: str = "default", catalog: Optional[list[TemplateInfo]] = None) -> list[TemplateInfo]:
    """Return only content (non-title) slides for a given theme, used by AI for plan generation."""
    if catalog is None:
        catalog = load_catalog()
    return [t for t in catalog if t.layout_role == "content" and t.theme == theme]


def select_template(scenario: str, catalog: Optional[list[TemplateInfo]] = None, theme: str = "default") -> TemplateInfo:
    """
    Select the best matching template for a given scenario description.
    Uses keyword scoring against scenario_tags and description.
    Falls back to hero_4_metrics if nothing matches well.
    """
    if catalog is None:
        catalog = load_catalog()

    # Only consider content slides from the requested theme
    catalog = get_content_catalog(theme=theme, catalog=catalog)
    if not catalog:
        # Fallback to default theme content if requested theme has no content slides yet
        catalog = get_content_catalog(theme="default", catalog=load_catalog())

    scenario_lower = scenario.lower()
    words = set(scenario_lower.split())

    best: Optional[TemplateInfo] = None
    best_score = -1

    for tmpl in catalog:
        score = 0
        for tag in tmpl.scenario_tags:
            tag_words = set(tag.lower().split())
            if tag.lower() in scenario_lower:
                score += 3  # exact phrase match
            else:
                overlap = len(words & tag_words)
                score += overlap

        # also check description
        desc_words = set(tmpl.description.lower().split())
        score += len(words & desc_words)

        if score > best_score:
            best_score = score
            best = tmpl

    if best is None or best_score == 0:
        # fallback to first template
        best = catalog[0]
        logger.warning("No template matched scenario %r, using fallback %s", scenario, best.id)

    logger.info("Selected template %r (score=%d) for scenario: %r", best.id, best_score, scenario)
    return best


def get_template_by_id(template_id: str, catalog: Optional[list[TemplateInfo]] = None) -> TemplateInfo:
    if catalog is None:
        catalog = load_catalog()
    for tmpl in catalog:
        if tmpl.id == template_id:
            return tmpl
    raise ValueError(f"Template not found: {template_id!r}")
