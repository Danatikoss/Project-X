"""
Training data & fine-tuning API.

POST /api/training/export          — analyze slides → generate JSONL
POST /api/training/fine-tune       — upload JSONL + start OpenAI fine-tuning job
GET  /api/training/jobs            — list fine-tuning jobs
GET  /api/training/jobs/{job_id}   — status of a specific job
"""

import os
import time
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models.user import User
from api.deps import get_admin_user
from services.training_data import (
    build_training_data,
    export_jsonl,
    get_finetune_job,
    list_finetune_jobs,
    upload_and_finetune,
)

router = APIRouter()

# Directory where exported JSONL files are stored
_EXPORT_DIR = Path(settings.export_dir) / "training"


# ── Schemas ──────────────────────────────────────────────────────────────────

class ExportRequest(BaseModel):
    limit: int = Field(default=300, ge=1, le=2000,
                       description="Max slides to analyze")
    skip_generated: bool = Field(default=True,
                                 description="Skip AI-generated slides")
    user_id: int | None = Field(default=None,
                                description="Restrict to a specific user's slides; None = all")


class ExportResponse(BaseModel):
    jsonl_path: str
    example_count: int
    message: str


class FineTuneRequest(BaseModel):
    jsonl_path: str = Field(description="Absolute or export-relative path to the JSONL file")
    model: str = Field(default="gpt-4o-mini-2024-07-18",
                       description="Base model to fine-tune")
    suffix: str = Field(default="slidegen",
                        description="Model name suffix (e.g. 'slidegen')")


class FineTuneResponse(BaseModel):
    job_id: str
    file_id: str
    model: str
    status: str
    message: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/export", response_model=ExportResponse)
async def export_training_data(
    req: ExportRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    """
    Analyze slides in the library using Vision and build a fine-tuning JSONL.
    This is a long-running operation — expect 2-10 seconds per slide.
    """
    examples = await build_training_data(
        db=db,
        user_id=req.user_id,
        limit=req.limit,
        skip_generated=req.skip_generated,
    )

    if not examples:
        raise HTTPException(
            status_code=422,
            detail="No training examples could be built. Check that slides have thumbnails.",
        )

    _EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    fname = f"training_{int(time.time())}.jsonl"
    out_path = str(_EXPORT_DIR / fname)
    export_jsonl(examples, out_path)

    return ExportResponse(
        jsonl_path=out_path,
        example_count=len(examples),
        message=f"Exported {len(examples)} training examples to {fname}",
    )


@router.post("/fine-tune", response_model=FineTuneResponse)
def start_fine_tune(
    req: FineTuneRequest,
    _admin: User = Depends(get_admin_user),
):
    """
    Upload the JSONL to OpenAI and start a fine-tuning job.
    Requires OPENAI_DIRECT_API_KEY (or OPENAI_API_KEY pointing to api.openai.com).
    """
    # Resolve path — allow relative paths inside the export dir
    jsonl_path = req.jsonl_path
    if not os.path.isabs(jsonl_path):
        jsonl_path = str(_EXPORT_DIR / jsonl_path)

    if not os.path.exists(jsonl_path):
        raise HTTPException(status_code=404, detail=f"JSONL file not found: {jsonl_path}")

    try:
        result = upload_and_finetune(
            jsonl_path=jsonl_path,
            model=req.model,
            suffix=req.suffix,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fine-tuning failed: {e}")

    return FineTuneResponse(
        **result,
        message=(
            f"Fine-tuning job {result['job_id']} started. "
            f"Poll GET /api/training/jobs/{result['job_id']} for status."
        ),
    )


@router.get("/jobs")
def list_jobs(_admin: User = Depends(get_admin_user)):
    """List the 10 most recent fine-tuning jobs."""
    try:
        return list_finetune_jobs(limit=10)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs/{job_id}")
def get_job(job_id: str, _admin: User = Depends(get_admin_user)):
    """Get status of a specific fine-tuning job."""
    try:
        return get_finetune_job(job_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))
