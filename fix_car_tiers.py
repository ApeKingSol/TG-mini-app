#!/usr/bin/env python3
"""Pixel-precise crop/erase fixes for car tier images (public/tier_*.webp).

Values below were derived by visually inspecting each image's alpha channel
against a checkerboard background (see scratchpad ruler renders), not by
blind percentage guessing. Tiers not listed need no fix - they already have
clean transparent backgrounds right up to the wheels.
"""

from pathlib import Path

from PIL import Image

PUBLIC_DIR = Path(__file__).parent / "public"

# tier -> keep rows [0, bottom_row) - i.e. crop everything at/after bottom_row
BOTTOM_CROP_ROW = {
    "tier_12": 497,
    "tier_14": 500,
    "tier_15": 505,
    "tier_16": 500,
    "tier_20": 450,
}

# tier -> list of (x0, y0, x1, y1) boxes to erase (set alpha=0) in place,
# used instead of a full-width crop when the artifact doesn't span the canvas
ERASE_BOXES = {
    "tier_20": [(265, 225, 700, 250)],
}


def apply_fix(name: str) -> None:
    path = PUBLIC_DIR / f"{name}.webp"
    img = Image.open(path).convert("RGBA")
    w, h = img.size

    if name in BOTTOM_CROP_ROW:
        bottom_row = BOTTOM_CROP_ROW[name]
        img = img.crop((0, 0, w, bottom_row))

    if name in ERASE_BOXES:
        pixels = img.load()
        for (x0, y0, x1, y1) in ERASE_BOXES[name]:
            for y in range(y0, y1):
                for x in range(x0, x1):
                    r, g, b, _ = pixels[x, y]
                    pixels[x, y] = (r, g, b, 0)

    img.save(path, format="WEBP", lossless=True)
    print(f"{name}: {w}x{h} -> {img.size[0]}x{img.size[1]}"
          + (f", erased {len(ERASE_BOXES[name])} box(es)" if name in ERASE_BOXES else ""))


def main() -> None:
    for name in sorted(set(BOTTOM_CROP_ROW) | set(ERASE_BOXES)):
        apply_fix(name)


if __name__ == "__main__":
    main()
