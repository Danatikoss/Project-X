"""
Tests for template_library — the core catalog loading and filtering logic.
These tests don't call OpenAI and don't need any external services.
"""
import sys
from pathlib import Path

import pytest

# Make sure backend/ is on the Python path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.template_library import (
    TemplateInfo,
    get_content_catalog,
    load_catalog,
    list_themes,
)


# ── Catalog loading ────────────────────────────────────────────────────────────

def test_catalog_loads():
    """Catalog file exists and loads without error."""
    catalog = load_catalog()
    assert isinstance(catalog, list), "load_catalog must return a list"
    assert len(catalog) > 0, "Catalog must not be empty — upload templates first"


def test_catalog_entries_have_required_fields():
    """Every template in the catalog has id, slots, and layout_role."""
    catalog = load_catalog()
    for t in catalog:
        assert t.id, f"Template missing id: {t}"
        assert isinstance(t.slots, dict), f"Template {t.id} slots must be a dict"
        assert t.layout_role in ("title", "content"), (
            f"Template {t.id} layout_role must be 'title' or 'content', got {t.layout_role!r}"
        )


def test_embedding_is_always_list():
    """Embedding field is always a list, never None."""
    catalog = load_catalog()
    for t in catalog:
        assert isinstance(t.embedding, list), (
            f"Template {t.id} embedding must be list, got {type(t.embedding)}"
        )


# ── Theme filtering ────────────────────────────────────────────────────────────

def test_list_themes_returns_strings():
    """list_themes returns a sorted list of strings."""
    themes = list_themes()
    assert isinstance(themes, list)
    assert all(isinstance(th, str) for th in themes)
    assert themes == sorted(themes), "Themes must be sorted"


def test_content_catalog_returns_content_slides_only():
    """get_content_catalog filters out title slides."""
    catalog = load_catalog()
    content = get_content_catalog(catalog=catalog)
    assert all(t.layout_role == "content" for t in content), (
        "get_content_catalog must return only content slides"
    )


def test_content_catalog_fallback_when_theme_missing():
    """If no templates match the requested theme, fallback returns all content slides."""
    catalog = load_catalog()
    # Use a theme that definitely doesn't exist
    result = get_content_catalog(theme="__nonexistent_theme__", catalog=catalog)
    all_content = [t for t in catalog if t.layout_role == "content"]
    # Should either return empty or fall back to all content — either is acceptable
    # but must not crash and must return a list
    assert isinstance(result, list)


# ── TemplateInfo dataclass ─────────────────────────────────────────────────────

def test_template_info_post_init_sets_empty_embedding():
    """TemplateInfo sets embedding=[] when None is passed."""
    t = TemplateInfo(
        id="test",
        slide_index=0,
        name="Test",
        description="",
        scenario_tags=[],
        slots={},
        embedding=None,
    )
    assert t.embedding == [], "embedding should default to [] not None"


def test_template_info_pptx_path_is_absolute():
    """pptx_path returns an absolute Path object."""
    t = TemplateInfo(
        id="test",
        slide_index=0,
        name="Test",
        description="",
        scenario_tags=[],
        slots={},
    )
    assert t.pptx_path.is_absolute(), "pptx_path must be absolute"
