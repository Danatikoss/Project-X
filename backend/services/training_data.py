"""
Fine-tuning training data pipeline.

Pipeline:
  1. Load slides from the DB that have thumbnails (real slides, not AI-generated)
  2. For each slide: send thumbnail to Claude/GPT Vision → reverse-engineer blueprint JSON
  3. Export as OpenAI fine-tuning JSONL (messages format)
  4. Upload JSONL to OpenAI Files API
  5. Start a fine-tuning job on gpt-4o-mini
"""

import base64
import json
import logging
import os
import time
from pathlib import Path
from typing import Generator

from openai import AsyncOpenAI, OpenAI
from sqlalchemy.orm import Session

from config import settings
from models.slide import SlideLibraryEntry
from services.slide_generator import _SYSTEM_PROMPT

logger = logging.getLogger(__name__)

# System prompt asking the model to analyze a slide IMAGE and produce a blueprint.
_VISION_SYSTEM_PROMPT = f"""You are an expert at reverse-engineering presentation slides.
Given a slide image, extract its structure into a blueprint JSON that matches this schema exactly:

{_SYSTEM_PROMPT}

Look at the slide carefully:
- Identify the layout type (icon_grid / key_message / process_flow / chart_bar / chart_pie / big_stat / two_column / comparison / timeline / quote / section_divider / title_content)
- Extract all text content faithfully
- Map it to the correct blueprint JSON schema

Respond with ONLY valid JSON, no markdown, no commentary."""


def _client() -> AsyncOpenAI:
    kwargs: dict = {"api_key": settings.openai_api_key}
    if settings.openai_base_url:
        kwargs["base_url"] = settings.openai_base_url
    return AsyncOpenAI(**kwargs)


def _sync_client() -> OpenAI:
    """Synchronous OpenAI client (for fine-tuning upload, which has no async variant)."""
    kwargs: dict = {"api_key": settings.openai_api_key}
    if settings.openai_base_url:
        kwargs["base_url"] = settings.openai_base_url
    return OpenAI(**kwargs)


def _thumbnail_to_b64(thumbnail_path: str) -> str | None:
    """Read thumbnail PNG from disk and return as base64 data URL."""
    abs_path = os.path.join(settings.thumbnail_dir, thumbnail_path)
    if not os.path.exists(abs_path):
        return None
    with open(abs_path, "rb") as f:
        data = f.read()
    return base64.b64encode(data).decode("utf-8")


async def reverse_engineer_blueprint(slide: SlideLibraryEntry) -> dict | None:
    """
    Send slide thumbnail to Vision model and get back a blueprint JSON.
    Returns None if thumbnail is missing or model fails.
    """
    b64 = _thumbnail_to_b64(slide.thumbnail_path or "")
    if not b64:
        logger.debug(f"Slide {slide.id}: no thumbnail, skipping")
        return None

    # Build user message — use title + text_content as textual hint alongside image
    hint_parts = []
    if slide.title:
        hint_parts.append(f"Slide title: {slide.title}")
    if slide.text_content:
        hint_parts.append(f"Text content:\n{slide.text_content[:600]}")
    user_text = "\n\n".join(hint_parts) if hint_parts else "Analyze this slide."

    client = _client()

    # Use a vision-capable model. If using OpenRouter, claude-opus/gpt-4o work.
    # For pure OpenAI fine-tuning workflow, default to gpt-4o.
    vision_model = "gpt-4o"
    if settings.openai_base_url:
        # OpenRouter: use the generator model which supports vision
        vision_model = settings.generator_model

    try:
        resp = await client.chat.completions.create(
            model=vision_model,
            messages=[
                {"role": "system", "content": _VISION_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{b64}", "detail": "high"},
                        },
                        {"type": "text", "text": user_text},
                    ],
                },
            ],
            temperature=0.1,
            max_tokens=800,
        )
        raw = (resp.choices[0].message.content or "").strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw.strip())
    except Exception as e:
        logger.warning(f"Slide {slide.id}: vision analysis failed — {e}")
        return None


def _make_training_example(prompt: str, blueprint: dict) -> dict:
    """Format a single training example in OpenAI messages fine-tuning format."""
    return {
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user",   "content": prompt},
            {"role": "assistant", "content": json.dumps(blueprint, ensure_ascii=False)},
        ]
    }


async def build_training_data(
    db: Session,
    user_id: int | None = None,
    limit: int = 500,
    skip_generated: bool = True,
) -> list[dict]:
    """
    Build training examples from the slide library.

    Args:
        db: SQLAlchemy session
        user_id: if set, only use this user's slides; None = all slides
        limit: max slides to process
        skip_generated: skip AI-generated slides (they're outputs, not targets)

    Returns:
        List of training example dicts (messages format)
    """
    query = db.query(SlideLibraryEntry).filter(
        SlideLibraryEntry.thumbnail_path.isnot(None)
    )
    if user_id is not None:
        from models.slide import SourcePresentation
        owned = db.query(SourcePresentation.id).filter(
            SourcePresentation.owner_id == user_id
        ).subquery()
        query = query.filter(SlideLibraryEntry.source_id.in_(owned))
    if skip_generated:
        query = query.filter(SlideLibraryEntry.is_generated == False)

    slides = query.limit(limit).all()
    logger.info(f"Processing {len(slides)} slides for training data")

    examples: list[dict] = []
    for slide in slides:
        # Use slide title (+ topic/key_message for context) as the user prompt
        prompt_parts = []
        if slide.title:
            prompt_parts.append(slide.title)
        if slide.key_message and slide.key_message != slide.title:
            prompt_parts.append(slide.key_message)
        prompt = " — ".join(prompt_parts) if prompt_parts else f"Slide {slide.id}"

        blueprint = await reverse_engineer_blueprint(slide)
        if blueprint is None:
            continue

        # Sanity check — must have layout field
        if "layout" not in blueprint:
            continue

        examples.append(_make_training_example(prompt, blueprint))
        logger.debug(f"Slide {slide.id} → layout={blueprint.get('layout')}")

    logger.info(f"Built {len(examples)} training examples")
    return examples


def export_jsonl(examples: list[dict], out_path: str) -> str:
    """Write training examples to a JSONL file. Returns the file path."""
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        for ex in examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")
    logger.info(f"Saved {len(examples)} examples → {out_path}")
    return out_path


def upload_and_finetune(
    jsonl_path: str,
    model: str = "gpt-4o-mini-2024-07-18",
    suffix: str = "slidegen",
) -> dict:
    """
    Upload JSONL to OpenAI Files API and start a fine-tuning job.
    Returns the job dict from OpenAI API.

    Note: uses a direct OpenAI API key (not OpenRouter) — fine-tuning is
    only available on api.openai.com. Set OPENAI_DIRECT_API_KEY env var
    if you use OpenRouter as your primary base_url.
    """
    direct_key = os.environ.get("OPENAI_DIRECT_API_KEY") or settings.openai_api_key
    client = OpenAI(api_key=direct_key)

    # Upload training file
    with open(jsonl_path, "rb") as f:
        file_obj = client.files.create(file=f, purpose="fine-tune")
    logger.info(f"Uploaded training file: {file_obj.id}")

    # Start fine-tuning job
    job = client.fine_tuning.jobs.create(
        training_file=file_obj.id,
        model=model,
        suffix=suffix,
        hyperparameters={"n_epochs": 3},
    )
    logger.info(f"Fine-tuning job started: {job.id}")
    return {
        "job_id": job.id,
        "file_id": file_obj.id,
        "model": model,
        "status": job.status,
        "created_at": job.created_at,
    }


def get_finetune_job(job_id: str) -> dict:
    """Retrieve fine-tuning job status from OpenAI."""
    direct_key = os.environ.get("OPENAI_DIRECT_API_KEY") or settings.openai_api_key
    client = OpenAI(api_key=direct_key)
    job = client.fine_tuning.jobs.retrieve(job_id)
    return {
        "job_id": job.id,
        "status": job.status,
        "model": job.model,
        "fine_tuned_model": job.fine_tuned_model,
        "trained_tokens": job.trained_tokens,
        "error": job.error.message if job.error else None,
    }


def list_finetune_jobs(limit: int = 10) -> list[dict]:
    """List recent fine-tuning jobs."""
    direct_key = os.environ.get("OPENAI_DIRECT_API_KEY") or settings.openai_api_key
    client = OpenAI(api_key=direct_key)
    jobs = client.fine_tuning.jobs.list(limit=limit)
    return [
        {
            "job_id": j.id,
            "status": j.status,
            "model": j.model,
            "fine_tuned_model": j.fine_tuned_model,
            "created_at": j.created_at,
        }
        for j in jobs.data
    ]
