# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow"]
# ///
"""Build the extension's icon set from a single source image.

Usage: uv run tools/build-icons.py <source-image>

Takes any square-ish source image, drops its white background, trims the
empty margin, re-squares it with a little breathing room, and writes the
four PNG sizes Chrome asks for into src/icons/.
"""

import sys
from pathlib import Path

from PIL import Image, ImageChops

SIZES = (128, 48, 32, 16)
OUT_DIR = Path(__file__).resolve().parent.parent / "src" / "icons"

# Pixels brighter than this on all three channels are treated as background.
WHITE_CUTOFF = 240
# Fraction of the final square left as empty margin on each side.
PADDING = 0.06


def drop_white_background(img: Image.Image) -> Image.Image:
    """Return a copy with near-white pixels made fully transparent."""
    img = img.convert("RGBA")
    r, g, b, alpha = img.split()

    # Darkest of the three channels: a pixel counts as background only if
    # every channel is near-white, so the dimmest one decides.
    darkest = ImageChops.darker(ImageChops.darker(r, g), b)
    keep = darkest.point(lambda v: 0 if v >= WHITE_CUTOFF else 255)

    img.putalpha(ImageChops.multiply(alpha, keep))
    return img


def square_with_padding(img: Image.Image) -> Image.Image:
    """Trim to the artwork, then center it on a transparent square canvas."""
    bbox = img.getbbox()
    if bbox is None:
        raise SystemExit("Source image is entirely background — nothing to crop.")
    art = img.crop(bbox)

    side = int(max(art.size) / (1 - 2 * PADDING))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(art, ((side - art.width) // 2, (side - art.height) // 2))
    return canvas


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: uv run tools/build-icons.py <source-image>")

    source = Path(sys.argv[1])
    if not source.is_file():
        raise SystemExit(f"No such file: {source}")

    master = square_with_padding(drop_white_background(Image.open(source)))
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for size in SIZES:
        out = OUT_DIR / f"icon{size}.png"
        master.resize((size, size), Image.LANCZOS).save(out, "PNG", optimize=True)
        print(f"wrote {out.relative_to(OUT_DIR.parent.parent)} ({size}x{size})")


if __name__ == "__main__":
    main()
