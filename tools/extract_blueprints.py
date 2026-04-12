"""
extract_blueprints.py — analyze PPTX files and extract slide style patterns.

Usage:
    python tools/extract_blueprints.py /path/to/pptx/folder

Output:
    tools/my_style_examples.json   — full per-slide data
    stdout                         — summary statistics
"""

import json
import sys
from collections import Counter
from pathlib import Path

from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE, PP_PLACEHOLDER_TYPE as PPT


def _para_text(para) -> str:
    """Concatenate all run text in a paragraph."""
    return "".join(run.text for run in para.runs) or para.text


def _word_count(text: str) -> int:
    return len(text.split()) if text.strip() else 0


def _extract_slide(slide, filename: str, slide_index: int) -> dict:
    layout_name: str = ""
    try:
        layout_name = slide.slide_layout.name
    except Exception:
        pass

    # ── Title ──────────────────────────────────────────────────────────────────
    title_text = ""
    try:
        title_ph = next(
            (
                ph
                for ph in slide.placeholders
                if ph.placeholder_format.type
                in (PPT.TITLE, PPT.CENTER_TITLE)
            ),
            None,
        )
        if title_ph and title_ph.has_text_frame:
            title_text = title_ph.text_frame.text.strip()
    except Exception:
        pass

    # ── Content blocks ─────────────────────────────────────────────────────────
    content_blocks: list[dict] = []
    has_image = False
    total_words = _word_count(title_text)

    TITLE_TYPES = {PPT.TITLE, PPT.CENTER_TITLE}

    for shape in slide.shapes:
        # Images
        try:
            if shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
                has_image = True
                content_blocks.append({"type": "image"})
                continue
        except Exception:
            pass

        # Tables
        try:
            if shape.has_table:
                content_blocks.append({"type": "table"})
                continue
        except Exception:
            pass

        # Text frames — skip the title placeholder (already captured)
        try:
            if not shape.has_text_frame:
                continue
        except Exception:
            continue

        # Skip title placeholder
        try:
            if (
                shape.is_placeholder
                and shape.placeholder_format.type in TITLE_TYPES
            ):
                continue
        except Exception:
            pass

        tf = shape.text_frame
        paragraphs_text: list[str] = []
        for para in tf.paragraphs:
            t = _para_text(para).strip()
            if t:
                paragraphs_text.append(t)

        if not paragraphs_text:
            continue

        full_text = "\n".join(paragraphs_text)
        wc = _word_count(full_text)
        total_words += wc

        content_blocks.append(
            {
                "type": "text",
                "text": full_text,
                "word_count": wc,
                "bullet_count": len(paragraphs_text),
            }
        )

    is_single_statement = bool(
        title_text and (not content_blocks or total_words < 15)
    )

    return {
        "file": filename,
        "slide_index": slide_index,
        "layout_name": layout_name,
        "title": title_text,
        "title_length": len(title_text),
        "content_blocks": content_blocks,
        "has_image": has_image,
        "total_words": total_words,
        "is_single_statement": is_single_statement,
    }


def analyze_folder(folder: Path) -> list[dict]:
    pptx_files = sorted(folder.glob("*.pptx"))
    if not pptx_files:
        print(f"No .pptx files found in {folder}", file=sys.stderr)
        return []

    results: list[dict] = []
    for pptx_path in pptx_files:
        try:
            prs = Presentation(str(pptx_path))
        except Exception as e:
            print(f"  Skipping {pptx_path.name}: {e}", file=sys.stderr)
            continue

        for i, slide in enumerate(prs.slides, start=1):
            try:
                record = _extract_slide(slide, pptx_path.name, i)
                results.append(record)
            except Exception as e:
                print(
                    f"  Error on {pptx_path.name} slide {i}: {e}",
                    file=sys.stderr,
                )

    return results


def print_summary(slides: list[dict]) -> None:
    n = len(slides)
    if n == 0:
        print("No slides found.")
        return

    layout_counts = Counter(s["layout_name"] for s in slides)
    avg_title_len = sum(s["title_length"] for s in slides) / n

    bullet_counts = [
        b["bullet_count"]
        for s in slides
        for b in s["content_blocks"]
        if b["type"] == "text"
    ]
    avg_bullets = sum(bullet_counts) / len(bullet_counts) if bullet_counts else 0.0

    pct_single = 100 * sum(1 for s in slides if s["is_single_statement"]) / n
    pct_images = 100 * sum(1 for s in slides if s["has_image"]) / n

    print(f"\n{'='*50}")
    print(f"  SLIDE STYLE ANALYSIS")
    print(f"{'='*50}")
    print(f"  Total slides analyzed : {n}")
    print(f"  Average title length  : {avg_title_len:.1f} chars")
    print(f"  Average bullets/slide : {avg_bullets:.1f}")
    print(f"  Single-statement      : {pct_single:.1f}%")
    print(f"  Slides with images    : {pct_images:.1f}%")
    print(f"\n  Layout frequency:")
    for layout, count in layout_counts.most_common():
        bar = "█" * min(count, 40)
        label = layout or "(unnamed)"
        print(f"    {label:<35} {count:>4}  {bar}")
    print(f"{'='*50}\n")


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python tools/extract_blueprints.py <folder>", file=sys.stderr)
        sys.exit(1)

    folder = Path(sys.argv[1])
    if not folder.is_dir():
        print(f"Not a directory: {folder}", file=sys.stderr)
        sys.exit(1)

    print(f"Scanning {folder} …")
    slides = analyze_folder(folder)

    out_path = Path(__file__).parent / "my_style_examples.json"
    out_path.write_text(json.dumps(slides, ensure_ascii=False, indent=2))
    print(f"Saved {len(slides)} slide records → {out_path}")

    print_summary(slides)


if __name__ == "__main__":
    main()
