"""
SLIDEX Backend — FastAPI Application Entry Point
"""
import logging
import os
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from config import settings
from database import create_tables
from rate_limit import limiter
from api.router import router
from api.ws import websocket_endpoint, assembly_room_endpoint
from api.wopi import wopi_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting SLIDEX backend...")

    # Ensure data directories exist
    for d in [settings.upload_dir, settings.thumbnail_dir, settings.export_dir]:
        Path(d).mkdir(parents=True, exist_ok=True)
    Path(settings.upload_dir, "media").mkdir(parents=True, exist_ok=True)

    # Seed slide_templates into the persistent volume on first run
    template_dir = Path(settings.template_dir)
    seed_dir = Path(__file__).parent / "slide_templates"
    if not (template_dir / "catalog.json").exists() and seed_dir.exists():
        logger.info("Seeding slide_templates into persistent volume at %s", template_dir)
        shutil.copytree(str(seed_dir), str(template_dir), dirs_exist_ok=True)
        logger.info("Template seed complete")

    # Create DB tables
    create_tables()
    logger.info("Database tables initialized")

    # Validate required settings
    if not settings.openai_api_key:
        logger.critical("OPENAI_API_KEY is not set — AI features will fail. Set it in .env")
    else:
        logger.info("OpenAI API key loaded (base_url: %s)", settings.openai_base_url or "default")

    yield

    # Shutdown
    logger.info("SLIDEX backend shutting down")


app = FastAPI(
    title="SLIDEX API",
    description="AI-powered presentation assembly platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — configure via ALLOWED_ORIGINS in .env
_origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(router, prefix="/api")

# WOPI callbacks — called directly by Collabora Online (no /api prefix)
app.include_router(wopi_router, prefix="/wopi")

# WebSocket endpoints
from fastapi import WebSocket

@app.websocket("/ws/indexing/{ws_token}")
async def ws_indexing(websocket: WebSocket, ws_token: str):
    await websocket_endpoint(websocket, ws_token)

@app.websocket("/ws/assembly/{assembly_id}")
async def ws_assembly(websocket: WebSocket, assembly_id: int):
    name = websocket.query_params.get("name", "Гость")[:50]
    await assembly_room_endpoint(websocket, assembly_id, name=name)

# Static file serving
# /thumbnails — public (PNG previews only, UUID-named, low sensitivity)
thumbnail_dir = Path(settings.thumbnail_dir)
thumbnail_dir.mkdir(parents=True, exist_ok=True)
app.mount("/thumbnails", StaticFiles(directory=str(thumbnail_dir)), name="thumbnails")

# /brand-backgrounds — public (admin-uploaded brand assets)
brand_bg_dir = Path(settings.upload_dir) / "brand_backgrounds"
brand_bg_dir.mkdir(parents=True, exist_ok=True)
app.mount("/brand-backgrounds", StaticFiles(directory=str(brand_bg_dir)), name="brand-backgrounds")

# /org-logos — public (org logo images uploaded by super-admin)
org_logo_dir = Path(settings.upload_dir) / "org_logos"
org_logo_dir.mkdir(parents=True, exist_ok=True)
app.mount("/org-logos", StaticFiles(directory=str(org_logo_dir)), name="org-logos")

# /exports — removed static mount; served only via authenticated POST /assemble/{id}/export
export_dir = Path(settings.export_dir)
export_dir.mkdir(parents=True, exist_ok=True)

# /media-files — authenticated endpoint below (cookie or Bearer token)
media_dir = Path(settings.upload_dir) / "media"
media_dir.mkdir(parents=True, exist_ok=True)

# /feedback-attachments — admin-only (protected by admin panel auth)
feedback_attach_dir = Path(settings.upload_dir) / "feedback_attachments"
feedback_attach_dir.mkdir(parents=True, exist_ok=True)
app.mount("/feedback-attachments", StaticFiles(directory=str(feedback_attach_dir)), name="feedback-attachments")


@app.get("/media-files/{file_path:path}")
async def serve_media(file_path: str, request: Request):
    """Serve media assets — requires valid session (Bearer token or refresh cookie)."""
    from fastapi import HTTPException as _HTTPException
    from fastapi.responses import FileResponse as _FileResponse
    from jose import jwt as _jwt, JWTError as _JWTError

    # Try Bearer token first, then fall back to refresh cookie to verify identity
    user_id: int | None = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            payload = _jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
            if payload.get("type") == "access":
                user_id = int(payload["sub"])
        except (_JWTError, Exception):
            pass

    if user_id is None:
        # Fall back to refresh cookie — proves the user has a valid session
        from api.auth import _COOKIE_NAME
        refresh_token = request.cookies.get(_COOKIE_NAME)
        if refresh_token:
            try:
                payload = _jwt.decode(refresh_token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
                if payload.get("type") == "refresh":
                    user_id = int(payload["sub"])
            except (_JWTError, Exception):
                pass

    if user_id is None:
        raise _HTTPException(status_code=401, detail="Требуется авторизация")

    # Resolve safely within media_dir — allow thumbs/ subdir, block traversal
    resolved = (media_dir / file_path).resolve()
    media_dir_resolved = media_dir.resolve()
    if not str(resolved).startswith(str(media_dir_resolved) + "/") and resolved != media_dir_resolved:
        raise _HTTPException(status_code=403, detail="Доступ запрещён")
    if not resolved.exists() or not resolved.is_file():
        raise _HTTPException(status_code=404, detail="Файл не найден")

    return _FileResponse(str(resolved))


@app.get("/health")
def health():
    return {"status": "ok", "service": "slidex"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
