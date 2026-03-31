"""
Vector similarity search.
Auto-detects backend:
  - sqlite_vec if installed (fast, SQL-integrated)
  - numpy fallback (pure Python cosine similarity)
"""
import json
import logging
import numpy as np
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session
    from models.slide import SlideLibraryEntry

logger = logging.getLogger(__name__)

# Detect backend
try:
    import sqlite_vec  # noqa: F401
    VECTOR_BACKEND = "sqlite_vec"
    logger.info("Vector backend: sqlite_vec")
except ImportError:
    VECTOR_BACKEND = "numpy"
    logger.info("Vector backend: numpy (sqlite_vec not installed)")


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    dot = np.dot(va, vb)
    norm_a = np.linalg.norm(va)
    norm_b = np.linalg.norm(vb)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))


def search_slides(
    db: "Session",
    query_embedding: list[float],
    top_k: int = 50,
    exclude_ids: list[int] | None = None,
    access_levels: list[str] | None = None,
    user_id: int | None = None,
) -> list[tuple["SlideLibraryEntry", float]]:
    """
    Find top_k most similar slides using cosine similarity.
    Returns list of (SlideLibraryEntry, similarity_score) tuples, sorted descending.
    """
    from models.slide import SlideLibraryEntry, SourcePresentation

    # Load all slides with embeddings
    query = db.query(SlideLibraryEntry).filter(
        SlideLibraryEntry.embedding_json.isnot(None),
        SlideLibraryEntry.is_outdated == False,  # noqa: E712
    )
    if user_id is not None:
        query = query.join(SourcePresentation).filter(SourcePresentation.owner_id == user_id)
    if exclude_ids:
        query = query.filter(SlideLibraryEntry.id.notin_(exclude_ids))
    if access_levels:
        query = query.filter(SlideLibraryEntry.access_level.in_(access_levels))

    slides = query.all()

    if not slides:
        return []

    # Compute similarities
    results: list[tuple["SlideLibraryEntry", float]] = []

    if VECTOR_BACKEND == "numpy":
        # Batch computation via numpy matrix operations
        embeddings = []
        valid_slides = []
        for slide in slides:
            try:
                emb = json.loads(slide.embedding_json)
                embeddings.append(emb)
                valid_slides.append(slide)
            except Exception:
                continue

        if not embeddings:
            return []

        matrix = np.array(embeddings, dtype=np.float32)  # shape: (N, 1536)
        query_vec = np.array(query_embedding, dtype=np.float32)  # shape: (1536,)

        # Normalize
        matrix_norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        query_norm = np.linalg.norm(query_vec)
        matrix_norms = np.where(matrix_norms == 0, 1e-10, matrix_norms)
        query_norm = max(query_norm, 1e-10)

        matrix_normalized = matrix / matrix_norms
        query_normalized = query_vec / query_norm

        similarities = matrix_normalized @ query_normalized  # shape: (N,)

        for slide, sim in zip(valid_slides, similarities.tolist()):
            results.append((slide, float(sim)))

    # Sort by similarity descending, return top_k
    results.sort(key=lambda x: x[1], reverse=True)
    return results[:top_k]


def keyword_search(
    db: "Session",
    query: str,
    top_k: int = 20,
    user_id: int | None = None,
) -> list["SlideLibraryEntry"]:
    """
    BM25-like fallback: keyword search on title, summary, tags.
    Uses SQLite LIKE for simplicity.
    """
    from models.slide import SlideLibraryEntry, SourcePresentation

    keywords = query.lower().split()
    if not keywords:
        return []

    results = db.query(SlideLibraryEntry).filter(
        SlideLibraryEntry.is_outdated == False  # noqa: E712
    )
    if user_id is not None:
        results = results.join(SourcePresentation).filter(SourcePresentation.owner_id == user_id)

    # Filter by each keyword (AND logic)
    from sqlalchemy import or_
    for kw in keywords[:5]:  # limit to 5 keywords
        pattern = f"%{kw}%"
        results = results.filter(
            or_(
                SlideLibraryEntry.title.ilike(pattern),
                SlideLibraryEntry.summary.ilike(pattern),
                SlideLibraryEntry.tags_json.ilike(pattern),
            )
        )

    return results.limit(top_k).all()
