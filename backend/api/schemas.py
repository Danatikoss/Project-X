"""Pydantic response/request schemas for all API routes."""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ─── Slides & Library ───────────────────────────────────────────────────────

class SourcePresentationResponse(BaseModel):
    id: int
    filename: str
    file_type: str
    slide_count: int
    status: str
    error_message: Optional[str] = None
    uploaded_at: datetime
    indexed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SlideResponse(BaseModel):
    id: int
    source_id: int
    slide_index: int
    thumbnail_url: str
    title: Optional[str] = None
    summary: Optional[str] = None
    tags: list[str] = []
    labels: list[str] = []
    layout_type: Optional[str] = None
    language: str = "ru"
    has_media: bool = False
    gif_url: Optional[str] = None
    gif_rect: Optional[dict] = None
    video_url: Optional[str] = None
    is_outdated: bool = False
    access_level: str = "internal"
    created_at: datetime
    source_filename: Optional[str] = None
    project_id: Optional[int] = None
    project_name: Optional[str] = None
    used_in_assemblies: int = 0

    class Config:
        from_attributes = True


class SlidePatchRequest(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    tags: Optional[list[str]] = None
    labels: Optional[list[str]] = None
    layout_type: Optional[str] = None
    is_outdated: Optional[bool] = None
    access_level: Optional[str] = None
    project_id: Optional[int] = None


class SlideListResponse(BaseModel):
    items: list[SlideResponse]
    total: int
    page: int
    page_size: int


# ─── Upload ──────────────────────────────────────────────────────────────────

class UploadResponse(BaseModel):
    source_id: int
    ws_token: str
    message: str


# ─── Assembly ────────────────────────────────────────────────────────────────

class AssembleRequest(BaseModel):
    prompt: str = Field(..., min_length=3)
    max_slides: int = Field(default=15, ge=1, le=50)


class AssembleBlankRequest(BaseModel):
    title: str = Field(default="Новая презентация", max_length=200)


class AssemblyPatchRequest(BaseModel):
    slide_ids: Optional[list[int]] = None
    title: Optional[str] = None
    overlays: Optional[dict] = None


class AssemblyResponse(BaseModel):
    id: int
    title: str
    prompt: str
    slides: list[SlideResponse]
    overlays: dict = {}
    status: str
    share_token: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AssemblyListItem(BaseModel):
    id: int
    title: str
    prompt: str
    slide_count: int
    status: str
    created_at: datetime
    thumbnail_urls: list[str] = []

    class Config:
        from_attributes = True


class ExportRequest(BaseModel):
    format: str = Field(default="pptx", pattern="^(pptx|pdf)$")


class ExportResponse(BaseModel):
    download_url: str
    filename: str


# ─── Search ──────────────────────────────────────────────────────────────────

class SearchResponse(BaseModel):
    items: list[SlideResponse]
    total: int
    query: str


# ─── Projects ────────────────────────────────────────────────────────────────

class ProjectResponse(BaseModel):
    id: int
    name: str
    color: str
    slide_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class ProjectCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    color: str = Field(default="#1E3A8A", pattern="^#[0-9a-fA-F]{6}$")


# ─── User Profile ────────────────────────────────────────────────────────────

class UserProfileResponse(BaseModel):
    id: int
    name: Optional[str] = None
    company: Optional[str] = None
    position: Optional[str] = None
    contact_slide_id: Optional[int] = None
    preferred_tags: list[str] = []
    default_language: str = "ru"
    ai_style: str = "official"

    class Config:
        from_attributes = True


class UserProfilePatchRequest(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None
    position: Optional[str] = None
    contact_slide_id: Optional[int] = None
    preferred_tags: Optional[list[str]] = None
    default_language: Optional[str] = None
    ai_style: Optional[str] = None


class ProfileStatsResponse(BaseModel):
    assemblies_count: int
    slides_count: int
