from fastapi import APIRouter
from api.library import router as library_router
from api.assemble import router as assemble_router
from api.search import router as search_router
from api.profile import router as profile_router
from api.auth import router as auth_router
from api.projects import router as projects_router
from api.brand import router as brand_router

router = APIRouter()

router.include_router(auth_router, prefix="/auth", tags=["Auth"])
router.include_router(library_router, prefix="/library", tags=["Library"])
router.include_router(assemble_router, prefix="/assemble", tags=["Assembly"])
router.include_router(search_router, prefix="/search", tags=["Search"])
router.include_router(profile_router, prefix="/profile", tags=["Profile"])
router.include_router(projects_router, prefix="/projects", tags=["Projects"])
router.include_router(brand_router, prefix="/brand", tags=["Brand"])
