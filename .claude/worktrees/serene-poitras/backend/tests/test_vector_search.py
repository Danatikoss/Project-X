"""
Tests for vector search — pure numpy math, no API calls needed.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.template_generator import _template_vector_search
from services.template_library import TemplateInfo


def _make_template(id: str, embedding: list) -> TemplateInfo:
    return TemplateInfo(
        id=id,
        slide_index=0,
        name=id,
        description="",
        scenario_tags=[],
        slots={},
        embedding=embedding,
    )


def test_returns_best_match():
    """Returns the template most similar to the query."""
    catalog = [
        _make_template("a", [1.0, 0.0, 0.0]),
        _make_template("b", [0.0, 1.0, 0.0]),
        _make_template("c", [0.0, 0.0, 1.0]),
    ]
    query = [1.0, 0.0, 0.0]  # identical to "a"
    result = _template_vector_search(query, catalog, top_k=1)
    assert len(result) == 1
    assert result[0].id == "a"


def test_top_k_respected():
    """Returns at most top_k results."""
    catalog = [_make_template(str(i), [float(i), 0.0]) for i in range(5)]
    result = _template_vector_search([1.0, 0.0], catalog, top_k=3)
    assert len(result) <= 3


def test_skips_zero_embeddings():
    """Templates with all-zero embeddings are skipped."""
    catalog = [
        _make_template("zero", [0.0, 0.0, 0.0]),
        _make_template("real", [1.0, 0.0, 0.0]),
    ]
    result = _template_vector_search([1.0, 0.0, 0.0], catalog, top_k=1)
    assert result[0].id == "real"


def test_fallback_when_no_embeddings():
    """Falls back to first template when no valid embeddings exist."""
    catalog = [
        _make_template("first", []),
        _make_template("second", []),
    ]
    result = _template_vector_search([1.0, 0.0], catalog, top_k=1)
    assert len(result) == 1
    assert result[0].id == "first"


def test_empty_catalog_returns_empty():
    """Empty catalog returns empty list without crash."""
    result = _template_vector_search([1.0, 0.0], [], top_k=1)
    assert result == []
