"""Media library — upload, organize into folders, serve assets."""
import logging
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import get_current_user
from config import settings
from database import get_db
from models.media import MediaAsset, MediaFolder
from models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Storage ──────────────────────────────────────────────────────────────────

MEDIA_DIR = Path(settings.upload_dir) / "media"

ALLOWED_TYPES: dict[str, str] = {
    "image/gif":       "gif",
    "image/jpeg":      "image",
    "image/png":       "image",
    "image/webp":      "image",
    "image/svg+xml":   "image",
    "video/mp4":       "video",
    "video/quicktime": "video",
    "video/webm":      "video",
}

ALLOWED_EXTENSIONS = {".gif", ".jpg", ".jpeg", ".png", ".webp", ".svg", ".mp4", ".mov", ".webm"}

MAX_SIZE = 500 * 1024 * 1024  # 500 MB


def _media_url(file_path: str) -> str:
    return f"/media-files/{file_path}"


# ── Schemas ───────────────────────────────────────────────────────────────────

class FolderResponse(BaseModel):
    id: int
    name: str
    asset_count: int = 0

    class Config:
        from_attributes = True


class AssetResponse(BaseModel):
    id: int
    folder_id: Optional[int] = None
    name: str
    file_type: str
    mime_type: Optional[str] = None
    file_size: Optional[int] = None
    url: str

    class Config:
        from_attributes = True


class FolderCreate(BaseModel):
    name: str


class FolderRename(BaseModel):
    name: str


class AssetPatch(BaseModel):
    name: Optional[str] = None
    folder_id: Optional[int] = None  # None means "move to root"
    clear_folder: bool = False        # explicit flag to remove from folder


# ── Folder endpoints ─────────────────────────────────────────────────────────

@router.get("/folders", response_model=list[FolderResponse])
def list_folders(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    folders = db.query(MediaFolder).all()
    result = []
    for f in folders:
        count = db.query(MediaAsset).filter(MediaAsset.folder_id == f.id).count()
        result.append(FolderResponse(id=f.id, name=f.name, asset_count=count))
    return result


@router.post("/folders", response_model=FolderResponse, status_code=201)
def create_folder(
    body: FolderCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Название папки не может быть пустым")
    folder = MediaFolder(owner_id=user.id, name=name)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return FolderResponse(id=folder.id, name=folder.name, asset_count=0)


@router.patch("/folders/{folder_id}", response_model=FolderResponse)
def rename_folder(
    folder_id: int,
    body: FolderRename,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    folder = db.query(MediaFolder).filter(MediaFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(404, "Папка не найдена")
    if folder.owner_id != user.id and not user.is_admin:
        raise HTTPException(403, "Нет доступа")
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Название не может быть пустым")
    folder.name = name
    db.commit()
    db.refresh(folder)
    count = db.query(MediaAsset).filter(MediaAsset.folder_id == folder.id).count()
    return FolderResponse(id=folder.id, name=folder.name, asset_count=count)


@router.delete("/folders/{folder_id}", status_code=204)
def delete_folder(
    folder_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    folder = db.query(MediaFolder).filter(MediaFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(404, "Папка не найдена")
    if folder.owner_id != user.id and not user.is_admin:
        raise HTTPException(403, "Нет доступа")
    # Move assets to root before deleting folder
    db.query(MediaAsset).filter(MediaAsset.folder_id == folder_id).update({"folder_id": None})
    db.delete(folder)
    db.commit()


# ── Asset endpoints ───────────────────────────────────────────────────────────

@router.get("/assets", response_model=list[AssetResponse])
def list_assets(
    folder_id: Optional[int] = None,
    unfoldered: bool = False,
    file_type: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(MediaAsset)
    if unfoldered:
        q = q.filter(MediaAsset.folder_id.is_(None))
    elif folder_id is not None:
        q = q.filter(MediaAsset.folder_id == folder_id)
    if file_type:
        q = q.filter(MediaAsset.file_type == file_type)
    assets = q.order_by(MediaAsset.created_at.desc()).all()
    return [
        AssetResponse(
            id=a.id,
            folder_id=a.folder_id,
            name=a.name,
            file_type=a.file_type,
            mime_type=a.mime_type,
            file_size=a.file_size,
            url=_media_url(a.file_path),
        )
        for a in assets
    ]


@router.post("/assets/upload", response_model=AssetResponse, status_code=201)
async def upload_asset(
    file: UploadFile = File(...),
    name: str = Form(...),
    folder_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Validate extension
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Неподдерживаемый тип файла: {ext}")

    # Determine file type
    mime = file.content_type or ""
    file_type = ALLOWED_TYPES.get(mime, "image")
    if ext == ".gif":
        file_type = "gif"
    elif ext in {".mp4", ".mov", ".webm"}:
        file_type = "video"

    # Validate folder exists
    if folder_id is not None:
        folder = db.query(MediaFolder).filter(MediaFolder.id == folder_id).first()
        if not folder:
            raise HTTPException(404, "Папка не найдена")

    # Stream file to disk — avoids loading large videos into memory
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4()}{ext}"
    dest = MEDIA_DIR / filename
    total = 0
    try:
        with open(dest, "wb") as f:
            while chunk := await file.read(1024 * 1024):  # 1 MB chunks
                total += len(chunk)
                if total > MAX_SIZE:
                    f.close()
                    dest.unlink(missing_ok=True)
                    raise HTTPException(413, f"Файл превышает {MAX_SIZE // 1024 // 1024} МБ")
                f.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        dest.unlink(missing_ok=True)
        logger.error("media upload write error: %s", e)
        raise HTTPException(500, "Ошибка при сохранении файла")

    asset = MediaAsset(
        owner_id=user.id,
        folder_id=folder_id,
        name=name.strip() or Path(file.filename or "file").stem,
        file_path=filename,
        file_type=file_type,
        mime_type=mime or None,
        file_size=total,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)

    return AssetResponse(
        id=asset.id,
        folder_id=asset.folder_id,
        name=asset.name,
        file_type=asset.file_type,
        mime_type=asset.mime_type,
        file_size=asset.file_size,
        url=_media_url(asset.file_path),
    )


@router.patch("/assets/{asset_id}", response_model=AssetResponse)
def update_asset(
    asset_id: int,
    body: AssetPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    asset = db.query(MediaAsset).filter(MediaAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(404, "Медиа не найдено")
    if asset.owner_id != user.id and not user.is_admin:
        raise HTTPException(403, "Нет доступа")

    if body.name is not None:
        name = body.name.strip()
        if name:
            asset.name = name

    if body.clear_folder:
        asset.folder_id = None
    elif body.folder_id is not None:
        folder = db.query(MediaFolder).filter(MediaFolder.id == body.folder_id).first()
        if not folder:
            raise HTTPException(404, "Папка не найдена")
        asset.folder_id = body.folder_id

    db.commit()
    db.refresh(asset)

    return AssetResponse(
        id=asset.id,
        folder_id=asset.folder_id,
        name=asset.name,
        file_type=asset.file_type,
        mime_type=asset.mime_type,
        file_size=asset.file_size,
        url=_media_url(asset.file_path),
    )


@router.delete("/assets/{asset_id}", status_code=204)
def delete_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    asset = db.query(MediaAsset).filter(MediaAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(404, "Медиа не найдено")
    if asset.owner_id != user.id and not user.is_admin:
        raise HTTPException(403, "Нет доступа")

    # Remove file from disk
    file_path = MEDIA_DIR / asset.file_path
    if file_path.exists():
        file_path.unlink()

    db.delete(asset)
    db.commit()
