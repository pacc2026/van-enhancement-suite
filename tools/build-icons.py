# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow"]
# ///
"""Build the extension's icon set from a single source image.

Usage: uv run tools/build-icons.py <source-image>

Takes any square-ish source image, drops its white background, trims the
empty margin, re-squares it with a little breathing room, and writes the
four PNG sizes Chrome asks for into src/icons/.

Wide subjects get two framings rather than one. A 2.19:1 van letterboxed into
a square leaves more than half the icon empty and collapses to an illegible
smudge at 16px, which is the size Chrome shows in the toolbar. So the small
sizes are cropped to the leading square of the artwork -- for a side-on
vehicle, the front end, which keeps a recognizable silhouette -- while the
large sizes, where there is room for it, show the whole subject. Chrome
supports different art per size natively; it just reads whichever file the
manifest's "icons" key points at for each one.

A source already close to square is detected and gets the whole subject at
every size, since cropping it would throw away detail for no gain.
"""

import sys
from pathlib import Path

from PIL import Image, ImageChops

# Which framing each size gets: "full" shows the whole subject, "front" crops
# to the leading square of it.
FRAMING = {128: "full", 48: "full", 32: "front", 16: "front"}
OUT_DIR = Path(__file__).resolve().parent.parent / "src" / "icons"

# Pixels brighter than this on all three channels are treated as background.
WHITE_CUTOFF = 240
# Fraction of the final square left as empty margin on each side.
PADDING = 0.06
# Subjects at least this wide relative to their height are cropped for the
# small sizes. Anything squarer already fills the frame well enough.
WIDE_ASPECT = 1.3


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


def trim_to_art(img: Image.Image) -> Image.Image:
    """Crop away the transparent margin, leaving just the artwork."""
    bbox = img.getbbox()
    if bbox is None:
        raise SystemExit("Source image is entirely background — nothing to crop.")
    return img.crop(bbox)


def front_crop(art: Image.Image) -> Image.Image:
    """Return the leading square of a wide subject.

    The source van faces left, so the leading edge carries the grille,
    headlight and windshield — the parts that still read as a vehicle once
    the icon is 16 pixels across.
    """
    side = min(art.size)
    return art.crop((0, 0, side, side))


def pad_to_square(art: Image.Image) -> Image.Image:
    """Center the artwork on a transparent square with a little margin."""
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

    art = trim_to_art(drop_white_background(Image.open(source)))
    aspect = art.width / art.height

    masters = {"full": pad_to_square(art)}
    if aspect >= WIDE_ASPECT:
        masters["front"] = pad_to_square(front_crop(art))
        print(f"source subject is {aspect:.2f}:1 — cropping the small sizes")
    else:
        # Square enough to show whole at every size.
        masters["front"] = masters["full"]
        print(f"source subject is {aspect:.2f}:1 — showing it whole at every size")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for size, framing in sorted(FRAMING.items(), reverse=True):
        out = OUT_DIR / f"icon{size}.png"
        master = masters[framing]
        master.resize((size, size), Image.LANCZOS).save(out, "PNG", optimize=True)
        print(f"wrote {out.relative_to(OUT_DIR.parent.parent)} ({size}x{size}, {framing})")


if __name__ == "__main__":
    main()
