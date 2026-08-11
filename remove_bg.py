#!/usr/bin/env python3
"""Convert black-background car JPEGs (output_cars/) into transparent webp (public/).

Background is near-pure-black already (mix-blend-mode: screen source art).
Uses a border flood-fill on the near-black mask so only the background blob
becomes transparent - dark car details (tires, tinted glass) that aren't
connected to the border stay opaque.
"""

from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

SRC_DIR = Path(__file__).parent / "output_cars"
DST_DIR = Path(__file__).parent / "public"
BLACK_THRESHOLD = 35


def remove_background(path: Path) -> Image.Image:
    img = Image.open(path).convert("RGB")
    arr = np.array(img)
    near_black = (arr.max(axis=2) < BLACK_THRESHOLD)

    labeled, _ = ndimage.label(near_black, structure=np.ones((3, 3)))
    border_labels = set(labeled[0, :]) | set(labeled[-1, :]) | set(labeled[:, 0]) | set(labeled[:, -1])
    border_labels.discard(0)

    background_mask = np.isin(labeled, list(border_labels))

    rgba = np.dstack([arr, np.full(arr.shape[:2], 255, dtype=np.uint8)])
    rgba[background_mask, 3] = 0
    return Image.fromarray(rgba, mode="RGBA")


def main() -> None:
    files = sorted(SRC_DIR.glob("tier_*.jpeg"))
    for path in files:
        out = remove_background(path)
        out_path = DST_DIR / f"{path.stem}.webp"
        out.save(out_path, format="WEBP", lossless=True)
        transparent_pct = 100 * (np.array(out)[:, :, 3] == 0).mean()
        print(f"{path.name}: {out.size[0]}x{out.size[1]}, {transparent_pct:.1f}% transparent -> {out_path}")


if __name__ == "__main__":
    main()
