"""
Semantic search endpoint.
GET /api/search?q=...&limit=20&offset=0
"""
import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from sqlalchemy.orm import joinedload

from database import get_db
from models.slide import SlideLibraryEntry
from models.user import User
from api.schemas import SearchResponse
from api.utils import slide_to_response
from api.deps import get_current_user
from services.embedding import embed_single
from services.vector_search import search_slides, keyword_search

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=SearchResponse)
async def search(
    q: str = Query(..., min_length=1),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not q.strip():
        return SearchResponse(items=[], total=0, query=q)

    query_embedding = await embed_single(q)
    vector_results = search_slides(db, query_embedding, top_k=limit + offset + 10, user_id=user.id)
    keyword_results = keyword_search(db, q, top_k=20, user_id=user.id)

    seen_ids: set[int] = set()
    merged: list[SlideLibraryEntry] = []

    for slide, _ in vector_results:
        if slide.id not in seen_ids:
            seen_ids.add(slide.id)
            merged.append(slide)

    for slide in keyword_results:
        if slide.id not in seen_ids:
            seen_ids.add(slide.id)
            merged.append(slide)

    total = len(merged)
    page_ids = [s.id for s in merged[offset:offset + limit]]

    # Re-fetch with eager loads to avoid N+1 queries in slide_to_response
    if page_ids:
        slides_map = {
            s.id: s for s in db.query(SlideLibraryEntry)
            .options(
                joinedload(SlideLibraryEntry.source),
                joinedload(SlideLibraryEntry.project),
            )
            .filter(SlideLibraryEntry.id.in_(page_ids))
            .all()
        }
        page_items = [slides_map[sid] for sid in page_ids if sid in slides_map]
    else:
        page_items = []

    return SearchResponse(
        items=[slide_to_response(s, db) for s in page_items],
        total=total,
        query=q,
    )
