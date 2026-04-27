import sys
from pydantic_settings import BaseSettings
from pydantic import Field, field_validator


class Settings(BaseSettings):
    openai_api_key: str = Field(default="", env="OPENAI_API_KEY")
    openai_base_url: str = Field(default="", env="OPENAI_BASE_URL")
    database_url: str = Field(default="sqlite:///./data/slidex.db", env="DATABASE_URL")
    upload_dir: str = Field(default="./data/uploads", env="UPLOAD_DIR")
    thumbnail_dir: str = Field(default="./data/thumbnails", env="THUMBNAIL_DIR")
    export_dir: str = Field(default="./data/exports", env="EXPORT_DIR")
    embedding_model: str = Field(default="text-embedding-3-small", env="EMBEDDING_MODEL")
    assembly_model: str = Field(default="gpt-4o", env="ASSEMBLY_MODEL")
    generator_model: str = Field(default="anthropic/claude-opus-4-6", env="GENERATOR_MODEL")
    # GPT-4o Vision post-render validator. Set to "" to disable (default off).
    vision_model: str = Field(default="", env="VISION_MODEL")
    max_upload_size_mb: int = Field(default=500, env="MAX_UPLOAD_SIZE_MB")
    jwt_secret: str = Field(default="dev-secret-change-in-production-min32ch!!", env="JWT_SECRET")

    @field_validator("jwt_secret")
    @classmethod
    def _check_jwt_secret(cls, v: str) -> str:
        insecure_defaults = {"dev-secret-change-in-production-min32ch!!", "change-me-in-production-use-random-32-chars"}
        if v in insecure_defaults or len(v) < 32:
            print("WARNING: JWT_SECRET is insecure. Set a strong random value in .env before going to production.", file=sys.stderr)
        return v
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7
    allowed_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000",
        env="ALLOWED_ORIGINS",
    )
    # Collabora Online integration (optional — leave empty to disable)
    collabora_url: str = Field(default="", env="COLLABORA_URL")
    wopi_base_url: str = Field(default="", env="WOPI_BASE_URL")

    # ── Fixed brand overrides (always applied to every generated slide) ──────
    # Set FIXED_BG_IMAGE to an absolute filesystem path to lock the background.
    fixed_bg_image: str = Field(default="", env="FIXED_BG_IMAGE")
    # Hex color without '#', e.g. "1E3A8A". Empty = use template or default.
    fixed_shape_color: str = Field(default="", env="FIXED_SHAPE_COLOR")
    # 0 = use template/default; >0 overrides title font size (pt)
    fixed_title_font_size: int = Field(default=0, env="FIXED_TITLE_FONT_SIZE")
    # 0 = use template/default; >0 overrides body font size (pt)
    fixed_body_font_size: int = Field(default=0, env="FIXED_BODY_FONT_SIZE")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
