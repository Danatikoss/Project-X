"""
Vector similarity search with hybrid scoring and MMR diversity reranking.
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

    results: list[tuple["SlideLibraryEntry", float]] = [
        (slide, float(sim)) for slide, sim in zip(valid_slides, similarities.tolist())
    ]

    # Sort by similarity descending, return top_k
    results.sort(key=lambda x: x[1], reverse=True)
    return results[:top_k]


def keyword_search(
    db: "Session",
    query: str,
    top_k: int = 20,
    user_id: int | None = None,
) -> list[tuple["SlideLibraryEntry", float]]:
    """
    Keyword search on title, summary, key_message, tags, text_content.
    Uses OR logic with simple term-frequency scoring.
    Returns list of (slide, keyword_score) sorted by score descending.
    """
    from models.slide import SlideLibraryEntry, SourcePresentation
    from sqlalchemy import or_

    keywords = [kw for kw in query.lower().split() if len(kw) > 1]
    if not keywords:
        return []

    base_query = db.query(SlideLibraryEntry).filter(
        SlideLibraryEntry.is_outdated == False  # noqa: E712
    )
    if user_id is not None:
        base_query = base_query.join(SourcePresentation).filter(SourcePresentation.owner_id == user_id)

    # OR across keywords and fields — find any slide that matches any keyword
    keyword_filters = []
    for kw in keywords[:8]:
        pattern = f"%{kw}%"
        keyword_filters.append(or_(
            SlideLibraryEntry.title.ilike(pattern),
            SlideLibraryEntry.summary.ilike(pattern),
            SlideLibraryEntry.key_message.ilike(pattern),
            SlideLibraryEntry.tags_json.ilike(pattern),
            SlideLibraryEntry.text_content.ilike(pattern),
        ))

    candidates = base_query.filter(or_(*keyword_filters)).limit(top_k * 3).all()

    # Score by how many keywords match across fields (simple TF proxy)
    scored: list[tuple["SlideLibraryEntry", float]] = []
    for slide in candidates:
        haystack = " ".join(filter(None, [
            slide.title or "",
            slide.summary or "",
            slide.key_message or "",
            slide.tags_json or "",
            slide.text_content or "",
        ])).lower()
        score = sum(1.0 for kw in keywords if kw in haystack)
        # Boost title matches (author-intended label is most reliable)
        title_lower = (slide.title or "").lower()
        score += sum(0.5 for kw in keywords if kw in title_lower)
        scored.append((slide, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:top_k]


def mmr_rerank(
    candidates: list[tuple["SlideLibraryEntry", float]],
    top_k: int,
    lambda_param: float = 0.7,
) -> list[tuple["SlideLibraryEntry", float]]:
    """
    Maximal Marginal Relevance reranking.
    Balances relevance (lambda_param) vs diversity (1 - lambda_param).
    Prevents returning semantically identical slides.
    """
    if len(candidates) <= top_k:
        return candidates

    # Build embedding matrix for candidates
    embeddings: list[np.ndarray] = []
    for slide, _ in candidates:
        if slide.embedding_json:
            try:
                emb = np.array(json.loads(slide.embedding_json), dtype=np.float32)
                norm = np.linalg.norm(emb)
                embeddings.append(emb / norm if norm > 1e-10 else emb)
            except Exception:
                embeddings.append(np.zeros(1536, dtype=np.float32))
        else:
            embeddings.append(np.zeros(1536, dtype=np.float32))

    scores = [score for _, score in candidates]
    max_score = max(scores) if scores else 1.0

    selected_indices: list[int] = []
    remaining = list(range(len(candidates)))

    while len(selected_indices) < top_k and remaining:
        best_idx = None
        best_mmr = -float("inf")

        for i in remaining:
            relevance = scores[i] / max_score if max_score > 0 else 0.0

            if not selected_indices:
                redundancy = 0.0
            else:
                # Max similarity to already-selected slides
                sims = [
                    float(np.dot(embeddings[i], embeddings[j]))
                    for j in selected_indices
                ]
                redundancy = max(sims)

            mmr_score = lambda_param * relevance - (1 - lambda_param) * redundancy
            if mmr_score > best_mmr:
                best_mmr = mmr_score
                best_idx = i

        if best_idx is None:
            break
        selected_indices.append(best_idx)
        remaining.remove(best_idx)

    return [candidates[i] for i in selected_indices]


def hybrid_search(
    db: "Session",
    query_embedding: list[float],
    query_text: str,
    top_k: int = 50,
    user_id: int | None = None,
    mmr_lambda: float = 0.7,
) -> list[tuple["SlideLibraryEntry", float]]:
    """
    Full hybrid retrieval: vector search + keyword search → score fusion → MMR rerank.
    Returns top_k diverse, relevant slides.
    """
    # 1. Vector search
    vector_results = search_slides(
        db, query_embedding, top_k=min(100, top_k * 4), user_id=user_id
    )

    # 2. Keyword search
    keyword_results = keyword_search(db, query_text, top_k=30, user_id=user_id)

    # 3. Score fusion — normalize vector scores, add keyword bonus
    seen_ids: dict[int, tuple["SlideLibraryEntry", float]] = {}

    for slide, vscore in vector_results:
        seen_ids[slide.id] = (slide, vscore)

    max_kw_score = max((s for _, s in keyword_results), default=1.0)
    for slide, kscore in keyword_results:
        normalized_kw = (kscore / max_kw_score) * 0.35  # keyword bonus up to +0.35
        if slide.id in seen_ids:
            existing_slide, existing_score = seen_ids[slide.id]
            seen_ids[slide.id] = (existing_slide, existing_score + normalized_kw)
        else:
            # Keyword-only hit — treat as moderate relevance
            seen_ids[slide.id] = (slide, 0.4 + normalized_kw)

    merged = list(seen_ids.values())
    merged.sort(key=lambda x: x[1], reverse=True)

    # 4. MMR diversity reranking on top-60 candidates
    candidates = merged[:60]
    return mmr_rerank(candidates, top_k=top_k, lambda_param=mmr_lambda)
