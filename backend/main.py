"""
SLIDEX Backend — FastAPI Application Entry Point
"""
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from config import settings
from database import create_tables
from api.router import router
from api.ws import websocket_endpoint

limiter = Limiter(key_func=get_remote_address)

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

# WebSocket endpoint
from fastapi import WebSocket
@app.websocket("/ws/indexing/{ws_token}")
async def ws_indexing(websocket: WebSocket, ws_token: str):
    await websocket_endpoint(websocket, ws_token)

# Static file serving (thumbnails + exports + media)
thumbnail_dir = Path(settings.thumbnail_dir)
thumbnail_dir.mkdir(parents=True, exist_ok=True)
app.mount("/thumbnails", StaticFiles(directory=str(thumbnail_dir)), name="thumbnails")

export_dir = Path(settings.export_dir)
export_dir.mkdir(parents=True, exist_ok=True)
app.mount("/exports", StaticFiles(directory=str(export_dir)), name="exports")

media_dir = Path(settings.upload_dir) / "media"
media_dir.mkdir(parents=True, exist_ok=True)
app.mount("/media-files", StaticFiles(directory=str(media_dir)), name="media-files")


@app.get("/health")
def health():
    return {"status": "ok", "service": "slidex"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
