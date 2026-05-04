"""Shared API utilities used across multiple routers."""
import json
from sqlalchemy.orm import Session
from models.slide import SlideLibraryEntry, SourcePresentation
from api.schemas import SlideResponse


def slide_to_response(slide: SlideLibraryEntry, db: Session = None, used_in_assemblies: int = 0) -> SlideResponse:
    tags = json.loads(slide.tags_json or "[]")
    labels = json.loads(slide.labels_json or "[]")
    gif_url = f"/thumbnails/{slide.gif_path}" if getattr(slide, 'gif_path', None) else None
    gif_rect = json.loads(slide.gif_rect_json) if getattr(slide, 'gif_rect_json', None) else None
    video_url = f"/thumbnails/{slide.video_path}" if getattr(slide, 'video_path', None) else None

    source = None
    if hasattr(slide, 'source') and slide.source is not None:
        source = slide.source
    elif db is not None:
        source = db.query(SourcePresentation).get(slide.source_id)

    project_name = None
    if hasattr(slide, 'project') and slide.project is not None:
        project_name = slide.project.name
    elif slide.project_id and db is not None:
        from models.project import Project
        p = db.query(Project).get(slide.project_id)
        project_name = p.name if p else None

    return SlideResponse(
        id=slide.id,
        source_id=slide.source_id,
        slide_index=slide.slide_index,
        thumbnail_url=f"/thumbnails/{slide.thumbnail_path}" if slide.thumbnail_path else "",
        title=slide.title,
        summary=slide.summary,
        tags=tags,
        labels=labels,
        layout_type=slide.layout_type,
        language=slide.language or "ru",
        has_media=slide.has_media or False,
        gif_url=gif_url,
        gif_rect=gif_rect,
        video_url=video_url,
        is_outdated=slide.is_outdated or False,
        access_level=slide.access_level or "internal",
        created_at=slide.created_at,
        source_filename=source.filename if source else None,
        project_id=slide.project_id,
        project_name=project_name,
        used_in_assemblies=used_in_assemblies,
    )
