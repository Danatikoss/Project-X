from pydantic_settings import BaseSettings
from pydantic import Field
import os


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
    max_upload_size_mb: int = Field(default=500, env="MAX_UPLOAD_SIZE_MB")
    jwt_secret: str = Field(default="change-me-in-production-use-random-32-chars", env="JWT_SECRET")
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

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
