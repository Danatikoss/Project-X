"""
Tests for _describe_slot_format — pure string logic, no API calls needed.
This is the function that tells the AI how to format each slot.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.template_generator import _describe_slot_format


def test_double_newline_hint_detected():
    """Hint with double newline → TITLE\\n\\nDESCRIPTION format."""
    result = _describe_slot_format("step_1", "Анализ данных\n\nОбрабатываем метрики")
    assert "\\n\\n" in result, "Double newline hint must produce \\n\\n format description"


def test_single_newline_hint_detected():
    """Hint with single newline → VALUE\\nLABEL format."""
    result = _describe_slot_format("metric_1", "750,000+\nПользователей")
    assert "\\n" in result


def test_metric_slot_name_inferred():
    """Slot named 'metric_2' with plain hint → metric VALUE\\nLABEL format."""
    result = _describe_slot_format("metric_2", "some text")
    assert "ЗНАЧЕНИЕ" in result or "VALUE" in result or "\\n" in result


def test_title_slot_inferred():
    """Slot named 'title' → short plain text format."""
    result = _describe_slot_format("title", "some text")
    assert "plain text" in result.lower() or "заголовок" in result.lower()


def test_description_slot_inferred():
    """Slot named 'description' → 1-2 sentence format."""
    result = _describe_slot_format("description", "some text")
    assert "plain text" in result.lower() or "предложени" in result.lower()


def test_step_slot_inferred():
    """Slot named 'step_1' with plain hint → step format."""
    result = _describe_slot_format("step_1", "some text")
    assert "\\n\\n" in result or "НАЗВАНИЕ" in result or "ОПИСАНИЕ" in result


def test_unknown_slot_returns_plain_text():
    """Unknown slot name with generic hint → plain text fallback."""
    result = _describe_slot_format("xyzzy_unknown_slot", "some text")
    assert isinstance(result, str)
    assert len(result) > 0
