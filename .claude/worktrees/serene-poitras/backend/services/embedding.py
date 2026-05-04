"""
OpenAI embeddings wrapper for text-embedding-3-small.
Supports batching for efficient API usage.
"""
import logging
from typing import Optional
from openai import AsyncOpenAI
from config import settings

logger = logging.getLogger(__name__)

_client: Optional[AsyncOpenAI] = None


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        kwargs = {"api_key": settings.openai_api_key}
        if settings.openai_base_url:
            kwargs["base_url"] = settings.openai_base_url
        _client = AsyncOpenAI(**kwargs)
    return _client


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    Embed a list of texts using text-embedding-3-small.
    Returns list of 1536-dim float vectors.
    OpenAI allows up to 2048 items per batch call.
    """
    if not texts:
        return []

    client = get_client()
    BATCH_SIZE = 100  # conservative batch size

    all_embeddings: list[list[float]] = []

    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i:i + BATCH_SIZE]
        # Clean texts — replace newlines which can hurt embedding quality
        cleaned = [t.replace("\n", " ").strip() or "пустой слайд" for t in batch]

        try:
            response = await client.embeddings.create(
                model=settings.embedding_model,
                input=cleaned,
            )
            batch_embeddings = [item.embedding for item in response.data]
            all_embeddings.extend(batch_embeddings)
        except Exception as e:
            logger.error(f"Embedding batch {i//BATCH_SIZE} failed: {e}")
            # Return zero vectors for failed batch so indexing can continue
            all_embeddings.extend([[0.0] * 1536] * len(batch))

    return all_embeddings


async def embed_single(text: str) -> list[float]:
    """Embed a single text string."""
    results = await embed_texts([text])
    return results[0] if results else [0.0] * 1536


def build_slide_embed_text(
    title: str,
    summary: str,
    tags: list[str],
    key_message: str | None = None,
    topic: str | None = None,
) -> str:
    """Build the canonical text used for slide embedding."""
    parts = []
    if title:
        parts.append(title)
    if key_message:
        parts.append(key_message)
    elif summary:
        parts.append(summary)
    if topic and topic != "other":
        parts.append(f"Тема: {topic}")
    if tags:
        parts.append("Ключевые слова: " + ", ".join(tags))
    return ". ".join(parts) if parts else "пустой слайд"
