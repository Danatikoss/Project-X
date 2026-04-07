from pathlib import Path
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from config import settings

_db_url = settings.database_url
_is_sqlite = _db_url.startswith("sqlite")

if _is_sqlite:
    _db_path = _db_url.replace("sqlite:///", "")
    if _db_path and not _db_path.startswith(":"):
        Path(_db_path).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        _db_url,
        connect_args={"check_same_thread": False},
        echo=False,
    )
else:
    engine = create_engine(_db_url, echo=False, pool_pre_ping=True)


@event.listens_for(engine, "connect")
def _on_connect(dbapi_conn, connection_record):
    if _is_sqlite:
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _add_column_if_missing(conn, table: str, column: str, definition: str):
    inspector = inspect(engine)
    existing = [c["name"] for c in inspector.get_columns(table)]
    if column not in existing:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))


def migrate_db():
    """Apply incremental schema migrations (works with both SQLite and PostgreSQL)."""
    tables = inspect(engine).get_table_names()
    with engine.begin() as conn:
        if "source_presentations" in tables:
            _add_column_if_missing(conn, "source_presentations", "owner_id", "INTEGER REFERENCES users(id)")
        if "assembled_presentations" in tables:
            _add_column_if_missing(conn, "assembled_presentations", "owner_id", "INTEGER REFERENCES users(id)")
            _add_column_if_missing(conn, "assembled_presentations", "share_token", "TEXT")
            _add_column_if_missing(conn, "assembled_presentations", "overlays_json", "TEXT DEFAULT '{}'")
            if _is_sqlite:
                conn.execute(text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_assembled_presentations_share_token "
                    "ON assembled_presentations(share_token) WHERE share_token IS NOT NULL"
                ))
            else:
                conn.execute(text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_assembled_presentations_share_token "
                    "ON assembled_presentations(share_token) WHERE share_token IS NOT NULL"
                ))
        if "slide_library_entries" in tables:
            _add_column_if_missing(conn, "slide_library_entries", "project_id", "INTEGER REFERENCES projects(id)")
            _add_column_if_missing(conn, "slide_library_entries", "labels_json", "TEXT DEFAULT '[]'")
            _add_column_if_missing(conn, "slide_library_entries", "gif_path", "TEXT")
            _add_column_if_missing(conn, "slide_library_entries", "gif_rect_json", "TEXT")
            _add_column_if_missing(conn, "slide_library_entries", "video_path", "TEXT")
            _add_column_if_missing(conn, "slide_library_entries", "is_generated", "BOOLEAN DEFAULT 0")
            _add_column_if_missing(conn, "slide_library_entries", "text_edits_json", "TEXT")
            _add_column_if_missing(conn, "slide_library_entries", "text_content", "TEXT")
            _add_column_if_missing(conn, "slide_library_entries", "key_message", "TEXT")
            _add_column_if_missing(conn, "slide_library_entries", "topic", "TEXT")
        if "user_profiles" in tables:
            _add_column_if_missing(conn, "user_profiles", "user_id", "INTEGER REFERENCES users(id)")
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_user_profiles_user_id "
                "ON user_profiles(user_id) WHERE user_id IS NOT NULL"
            ))
            _add_column_if_missing(conn, "user_profiles", "position", "TEXT")
            _add_column_if_missing(conn, "user_profiles", "default_language", "TEXT DEFAULT 'ru'")
            _add_column_if_missing(conn, "user_profiles", "ai_style", "TEXT DEFAULT 'official'")
        if "projects" in tables:
            _add_column_if_missing(conn, "projects", "owner_id", "INTEGER REFERENCES users(id)")
        if "users" in tables:
            _add_column_if_missing(conn, "users", "is_admin", "BOOLEAN DEFAULT 0")
        if "brand_templates" in tables:
            _add_column_if_missing(conn, "brand_templates", "background_image_path", "TEXT")
            _add_column_if_missing(conn, "brand_templates", "font_family", "TEXT DEFAULT 'Montserrat'")
            _add_column_if_missing(conn, "brand_templates", "title_font_color", "TEXT DEFAULT 'FFFFFF'")
            _add_column_if_missing(conn, "brand_templates", "title_font_size", "INTEGER DEFAULT 30")
            _add_column_if_missing(conn, "brand_templates", "body_font_color", "TEXT DEFAULT '1E293B'")
            _add_column_if_missing(conn, "brand_templates", "body_font_size", "INTEGER DEFAULT 18")
            _add_column_if_missing(conn, "brand_templates", "shape_color", "TEXT DEFAULT '1E3A8A'")
            _add_column_if_missing(conn, "brand_templates", "shape_opacity", "INTEGER DEFAULT 100")
            _add_column_if_missing(conn, "brand_templates", "title_x", "REAL DEFAULT 0.038")
            _add_column_if_missing(conn, "brand_templates", "title_y", "REAL DEFAULT 0.00")
            _add_column_if_missing(conn, "brand_templates", "title_w", "REAL DEFAULT 0.924")
            _add_column_if_missing(conn, "brand_templates", "title_h", "REAL DEFAULT 0.193")
            _add_column_if_missing(conn, "brand_templates", "body_x",  "REAL DEFAULT 0.038")
            _add_column_if_missing(conn, "brand_templates", "body_y",  "REAL DEFAULT 0.220")
            _add_column_if_missing(conn, "brand_templates", "body_w",  "REAL DEFAULT 0.924")
            _add_column_if_missing(conn, "brand_templates", "body_h",  "REAL DEFAULT 0.760")


def create_tables():
    from models import slide, assembly, user, project, brand, media, template, theses  # noqa: F401
    # Drop old assembly_theses table if it exists (replaced by theses_sessions)
    try:
        existing_tables = inspect(engine).get_table_names()
        if "assembly_theses" in existing_tables and "theses_sessions" not in existing_tables:
            with engine.begin() as conn:
                conn.execute(text("DROP TABLE assembly_theses"))
    except Exception:
        pass

    # Drop old assembly_templates if schema changed (had AI 'prompt' column)
    try:
        existing_tables = inspect(engine).get_table_names()
        if "assembly_templates" in existing_tables:
            existing_cols = [c["name"] for c in inspect(engine).get_columns("assembly_templates")]
            if "prompt" in existing_cols:
                with engine.begin() as conn:
                    conn.execute(text("DROP TABLE assembly_templates"))
    except Exception:
        pass

    Base.metadata.create_all(bind=engine)
    migrate_db()
