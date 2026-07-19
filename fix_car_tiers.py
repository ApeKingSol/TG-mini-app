#!/usr/bin/env python3
"""Hardcoded percentage-based crop fixes for car tier images (public/tier_*.webp).

Edit CROP_CONFIG to tune per-tier bottom/top crop percentages, then re-run.
"""

import subprocess
from pathlib import Path

from PIL import Image

PUBLIC_DIR = Path(__file__).parent / "public"

# tier -> {"top": fraction of height to remove from top, "bottom": fraction to remove from bottom}
CROP_CONFIG = {
    "tier_2":  {"top": 0.0,  "bottom": 0.15},
    "tier_5":  {"top": 0.0,  "bottom": 0.15},
    "tier_6":  {"top": 0.0,  "bottom": 0.15},
    "tier_7":  {"top": 0.0,  "bottom": 0.15},
    "tier_12": {"top": 0.0,  "bottom": 0.15},
    "tier_15": {"top": 0.0,  "bottom": 0.15},
    "tier_16": {"top": 0.0,  "bottom": 0.15},
    "tier_14": {"top": 0.0,  "bottom": 0.10},
    "tier_20": {"top": 0.05, "bottom": 0.15},
}

# tiers to revert to the last committed version instead of cropping
RESTORE_TIERS = ["tier_11", "tier_19"]


def crop_tier(name: str, top_pct: float, bottom_pct: float) -> None:
    path = PUBLIC_DIR / f"{name}.webp"
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    top_px = round(h * top_pct)
    bottom_px = h - round(h * bottom_pct)
    cropped = img.crop((0, top_px, w, bottom_px))
    cropped.save(path, format="WEBP", lossless=True)
    print(f"{name}: {w}x{h} -> {w}x{cropped.size[1]} "
          f"(top -{top_px}px, bottom -{h - bottom_px}px)")


def restore_tier(name: str) -> None:
    path = PUBLIC_DIR / f"{name}.webp"
    result = subprocess.run(
        ["git", "checkout", "--", str(path.relative_to(Path(__file__).parent))],
        cwd=Path(__file__).parent,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"{name}: restore FAILED - {result.stderr.strip()}")
    else:
        print(f"{name}: restored to last committed version")


def main() -> None:
    for name, cfg in CROP_CONFIG.items():
        crop_tier(name, cfg["top"], cfg["bottom"])
    for name in RESTORE_TIERS:
        restore_tier(name)


if __name__ == "__main__":
    main()
