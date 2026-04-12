from fastapi import APIRouter
from api.library import router as library_router
from api.assemble import router as assemble_router
from api.search import router as search_router
from api.profile import router as profile_router
from api.auth import router as auth_router
from api.projects import router as projects_router
from api.media import router as media_router
from api.templates import router as templates_router
from api.admin import router as admin_router
from api.wopi import api_router as wopi_api_router

router = APIRouter()

router.include_router(auth_router, prefix="/auth", tags=["Auth"])
router.include_router(library_router, prefix="/library", tags=["Library"])
router.include_router(assemble_router, prefix="/assemble", tags=["Assembly"])
router.include_router(search_router, prefix="/search", tags=["Search"])
router.include_router(profile_router, prefix="/profile", tags=["Profile"])
router.include_router(projects_router, prefix="/projects", tags=["Projects"])
router.include_router(media_router, prefix="/media", tags=["Media"])
router.include_router(templates_router, prefix="/templates", tags=["Templates"])
router.include_router(admin_router, prefix="/admin", tags=["Admin"])
# Collabora WOPI token endpoint (authenticated, feature-flagged)
router.include_router(wopi_api_router, prefix="/wopi", tags=["WOPI"])
