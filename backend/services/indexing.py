"""
Upload & Indexing Pipeline.
Flow: save file → extract slides → render thumbnails → AI metadata (vision) → embeddings → projects → store
"""
import asyncio
import base64
import io
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from openai import AsyncOpenAI
from sqlalchemy.orm import Session

from config import settings
from database import SessionLocal
from models.slide import SourcePresentation, SlideLibraryEntry
from services.thumbnail import extract_pptx_slides, extract_pdf_slides, save_thumbnail, save_media
from services.embedding import embed_texts, build_slide_embed_text, get_client
from api.ws import manager as ws_manager

logger = logging.getLogger(__name__)



SINGLE_SLIDE_PROMPT = """Ты анализируешь один слайд презентации. Верни строго JSON-объект с полями:
- "title": содержательный заголовок слайда (до 60 символов, на языке слайда). НЕ пиши "Слайд 1" — читай реальный текст на слайде.
- "summary": одно предложение о содержании
- "tags": массив из 3-7 ключевых слов
- "layout_type": один из: "title", "content", "chart", "image", "table", "section", "blank"
- "language": "ru", "kk", или "en"

Ответь ТОЛЬКО JSON-объектом."""


def _resize_for_vision(img_bytes: bytes, max_width: int = 768) -> bytes:
    """Resize image to reduce payload size while keeping it readable."""
    from PIL import Image
    img = Image.open(io.BytesIO(img_bytes))
    if img.width > max_width:
        ratio = max_width / img.width
        new_h = int(img.height * ratio)
        img = img.resize((max_width, new_h), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=85)
    return buf.getvalue()


def _img_to_base64(img_bytes: bytes) -> str:
    return base64.b64encode(img_bytes).decode("utf-8")


async def _extract_single_metadata(
    client: AsyncOpenAI,
    text: str,
    thumbnail: bytes | None,
) -> dict:
    """Extract metadata for a single slide. Uses vision when text is empty."""
    has_text = bool(text and text.strip())

    if has_text:
        user_content: list | str = f"Текст слайда:\n{text}"
    elif thumbnail:
        small_img = _resize_for_vision(thumbnail)
        user_content = [
            {"type": "text", "text": "Проанализируй этот слайд:"},
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{_img_to_base64(small_img)}",
                    "detail": "low",
                }
            }
        ]
    else:
        user_content = "Пустой слайд без текста и изображения."

    try:
        response = await client.chat.completions.create(
            model=settings.assembly_model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SINGLE_SLIDE_PROMPT},
                {"role": "user", "content": user_content},
            ],
            temperature=0.1,
        )
        raw = response.choices[0].message.content or "{}"
        return json.loads(raw)
    except Exception as e:
        logger.error(f"Single slide metadata failed: {e}")
        return {}


def _safe_metadata(raw: dict, slide_text: str, slide_idx: int, pptx_title: str | None = None) -> dict:
    ai_title = str(raw.get("title", "") or "").strip()

    # Prefer the PPTX title shape — it's the author's explicit label.
    # Fall back to AI only when the PPTX title is absent or trivial.
    if pptx_title and len(pptx_title) > 2 and not pptx_title.isdigit():
        title = pptx_title
    elif ai_title and not ai_title.lower().startswith("слайд"):
        title = ai_title
    else:
        title = f"Слайд {slide_idx + 1}"

    return {
        "title": title[:120],
        "summary": str(raw.get("summary", "") or slide_text[:200]),
        "tags": raw.get("tags", []) if isinstance(raw.get("tags"), list) else [],
        "layout_type": raw.get("layout_type", "content"),
        "language": raw.get("language", "ru"),
    }



async def index_presentation(source_id: int, ws_token: str):
    """
    Background task: index a presentation file.
    Sends WebSocket progress updates throughout.
    """
    db: Session = SessionLocal()

    try:
        source = db.query(SourcePresentation).get(source_id)
        if not source:
            logger.error(f"SourcePresentation {source_id} not found")
            return

        source.status = "indexing"
        db.commit()

        await ws_manager.send_progress(ws_token, "extracting", 0.05,
                                        "Извлечение слайдов из файла...")

        # --- Step 1: Extract slides ---
        file_path = source.file_path
        try:
            if source.file_type == "pptx":
                slide_data_list = extract_pptx_slides(file_path)
            else:
                slide_data_list = extract_pdf_slides(file_path)
        except Exception as e:
            logger.error(f"Slide extraction failed: {e}")
            source.status = "error"
            source.error_message = str(e)
            db.commit()
            await ws_manager.send_error(ws_token, f"Не удалось извлечь слайды: {e}")
            return

        total = len(slide_data_list)
        source.slide_count = total
        db.commit()

        await ws_manager.send_progress(ws_token, "thumbnailing", 0.1,
                                        f"Сохранение миниатюр ({total} слайдов)...",
                                        processed=0, total=total)

        # --- Step 2: Save thumbnails ---
        for i, sd in enumerate(slide_data_list):
            thumb_rel = save_thumbnail(
                sd.thumbnail_bytes, source_id, sd.index, settings.thumbnail_dir
            )
            sd._thumb_path = thumb_rel
            # Save GIF if present
            if getattr(sd, 'gif_bytes', None):
                sd._gif_path = save_media(sd.gif_bytes, source_id, sd.index, settings.thumbnail_dir, 'gif')
            else:
                sd._gif_path = None
            # Save video if present
            if getattr(sd, 'video_bytes', None) and sd.video_ext:
                sd._video_path = save_media(sd.video_bytes, source_id, sd.index, settings.thumbnail_dir, sd.video_ext)
            else:
                sd._video_path = None
            if i % 5 == 0:
                progress = 0.1 + (i / total) * 0.2
                await ws_manager.send_progress(
                    ws_token, "thumbnailing", progress,
                    f"Миниатюра {i+1} из {total}...",
                    processed=i + 1, total=total
                )

        await ws_manager.send_progress(ws_token, "metadata", 0.3,
                                        "Анализ слайдов через AI...",
                                        processed=0, total=total)

        # --- Step 3: AI Metadata extraction — per slide, parallel batches of 4 ---
        _oai_kwargs = {"api_key": settings.openai_api_key}
        if settings.openai_base_url:
            _oai_kwargs["base_url"] = settings.openai_base_url
        client = AsyncOpenAI(**_oai_kwargs)
        all_metadata: list[dict] = [{}] * total

        CONCURRENCY = 4
        for batch_start in range(0, total, CONCURRENCY):
            batch = slide_data_list[batch_start:batch_start + CONCURRENCY]
            tasks = [
                _extract_single_metadata(
                    client,
                    sd.text,
                    sd.thumbnail_bytes if not (sd.text and sd.text.strip()) else None,
                )
                for sd in batch
            ]
            raw_metas = await asyncio.gather(*tasks)

            for j, (sd, raw_meta) in enumerate(zip(batch, raw_metas)):
                all_metadata[batch_start + j] = _safe_metadata(raw_meta, sd.text, batch_start + j, pptx_title=sd.pptx_title)

            progress = 0.3 + ((batch_start + len(batch)) / total) * 0.35
            await ws_manager.send_progress(
                ws_token, "metadata", progress,
                f"Анализ: {min(batch_start + CONCURRENCY, total)} из {total}...",
                processed=batch_start + len(batch), total=total
            )

        await ws_manager.send_progress(ws_token, "embedding", 0.65,
                                        "Создание векторных эмбеддингов...",
                                        processed=0, total=total)

        # --- Step 4: Generate embeddings ---
        embed_texts_list = [
            build_slide_embed_text(meta["title"], meta["summary"], meta["tags"])
            for meta in all_metadata
        ]
        embeddings = await embed_texts(embed_texts_list)

        await ws_manager.send_progress(ws_token, "saving", 0.85,
                                        "Сохранение в базу данных...",
                                        processed=total, total=total)

        # --- Step 5: Save SlideLibraryEntry records ---
        for i, (sd, meta, emb) in enumerate(zip(slide_data_list, all_metadata, embeddings)):
            entry = SlideLibraryEntry(
                source_id=source_id,
                slide_index=sd.index,
                thumbnail_path=getattr(sd, "_thumb_path", None),
                xml_blob=sd.xml_blob,
                slide_json=sd.slide_json,
                title=meta["title"],
                summary=meta["summary"],
                tags_json=json.dumps(meta["tags"], ensure_ascii=False),
                layout_type=meta["layout_type"],
                language=meta["language"],
                embedding_json=json.dumps(emb),
                has_media=getattr(sd, "has_video", False) or getattr(sd, "has_gif", False),
                gif_path=getattr(sd, '_gif_path', None),
                gif_rect_json=json.dumps(sd.gif_rect) if sd.gif_rect else None,
                video_path=getattr(sd, '_video_path', None),
            )
            db.add(entry)

        source.status = "done"
        source.indexed_at = datetime.now(timezone.utc)
        db.commit()

        await ws_manager.send_done(ws_token, source_id, total)
        logger.info(f"Indexing complete: source_id={source_id}, slides={total}")

    except Exception as e:
        logger.exception(f"Indexing pipeline error for source {source_id}: {e}")
        try:
            source = db.query(SourcePresentation).get(source_id)
            if source:
                source.status = "error"
                source.error_message = str(e)
                db.commit()
        except Exception:
            pass
        await ws_manager.send_error(ws_token, str(e))
    finally:
        db.close()
