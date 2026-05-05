"""Magic-byte file type verification — never trust client Content-Type."""

SIGNATURES: list[tuple[bytes, int, str]] = [
    # Images
    (b"\x89PNG\r\n\x1a\n", 0, "image/png"),
    (b"\xff\xd8\xff", 0, "image/jpeg"),
    (b"GIF87a", 0, "image/gif"),
    (b"GIF89a", 0, "image/gif"),
    (b"RIFF", 0, "_riff"),      # partial — need to check offset 8 for WEBP
    (b"WEBP", 8, "image/webp"),
    # Documents
    (b"%PDF-", 0, "application/pdf"),
    (b"PK\x03\x04", 0, "application/zip"),  # PPTX, DOCX, XLSX are ZIP
    # Video
    (b"\x00\x00\x00\x18ftyp", 0, "video/mp4"),
    (b"\x00\x00\x00\x1cftyp", 0, "video/mp4"),
    (b"\x00\x00\x00\x20ftyp", 0, "video/mp4"),
    (b"ftyp", 4, "video/mp4"),
    (b"\x1aE\xdf\xa3", 0, "video/webm"),
]

# What we accept per upload context
ALLOWED_IMAGE_MAGIC = {"image/png", "image/jpeg", "image/gif", "image/webp"}
ALLOWED_PPTX_PDF_MAGIC = {"application/zip", "application/pdf"}  # pptx = zip
ALLOWED_MEDIA_MAGIC = {"image/png", "image/jpeg", "image/gif", "image/webp", "video/mp4", "video/webm", "application/zip"}


def detect_type(header: bytes) -> str | None:
    """Return detected MIME type from first 32 bytes, or None if unknown."""
    for sig, offset, mime in SIGNATURES:
        end = offset + len(sig)
        if len(header) >= end and header[offset:end] == sig:
            if mime == "_riff":
                continue  # matched RIFF prefix, but haven't matched WEBP yet
            return mime
    return None


def verify_image(header: bytes) -> str:
    """Raise ValueError if header is not a recognised image type."""
    t = detect_type(header)
    if t not in ALLOWED_IMAGE_MAGIC:
        raise ValueError(f"Файл не является изображением (обнаружен тип: {t or 'неизвестный'})")
    return t


def verify_pptx_or_pdf(header: bytes, declared_ext: str) -> None:
    """Raise ValueError if header doesn't match PPTX (ZIP) or PDF."""
    t = detect_type(header)
    if declared_ext == "pdf" and t != "application/pdf":
        raise ValueError("Файл не является PDF")
    if declared_ext == "pptx" and t != "application/zip":
        raise ValueError("Файл не является PPTX (ожидался ZIP-архив)")


def verify_media(header: bytes, ext: str) -> None:
    """Raise ValueError for disallowed media types."""
    t = detect_type(header)
    # GIF magic matches correctly; MP4/WebM/images checked above
    if ext == ".gif" and t != "image/gif":
        raise ValueError("Файл не является GIF")
    if ext in {".mp4", ".mov"} and t != "video/mp4":
        raise ValueError("Файл не является MP4")
    if ext == ".webm" and t != "video/webm":
        raise ValueError("Файл не является WebM")
