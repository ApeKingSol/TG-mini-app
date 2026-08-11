#!/usr/bin/env python3
"""Click-to-crop tool: click the bottom of the tires, everything below gets cropped away."""

import re
import tkinter as tk
from pathlib import Path

from PIL import Image, ImageTk

INPUT_DIR = Path(__file__).parent / "input"
OUTPUT_DIR = Path(__file__).parent / "output"
MAX_DISPLAY_SIZE = (1000, 700)


def natural_key(path: Path):
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", path.stem)]


class CropTool:
    def __init__(self, root, files):
        self.root = root
        self.files = files
        self.index = 0

        self.canvas = tk.Canvas(root, cursor="crosshair")
        self.canvas.pack()
        self.status = tk.Label(root, font=("Helvetica", 12))
        self.status.pack(fill="x")

        self.canvas.bind("<Button-1>", self.on_click)
        self.canvas.bind("<Motion>", self.on_move)

        self.guide_line = None
        self.load_current()

    def load_current(self):
        if self.index >= len(self.files):
            self.status.config(text=f"Done. {len(self.files)} images saved to {OUTPUT_DIR}")
            self.canvas.delete("all")
            return

        path = self.files[self.index]
        self.original = Image.open(path).convert("RGBA")
        ow, oh = self.original.size

        self.scale = min(MAX_DISPLAY_SIZE[0] / ow, MAX_DISPLAY_SIZE[1] / oh, 1.0)
        dw, dh = int(ow * self.scale), int(oh * self.scale)

        display_img = self.original.resize((dw, dh)) if self.scale != 1.0 else self.original
        self.tk_image = ImageTk.PhotoImage(display_img)

        self.canvas.config(width=dw, height=dh)
        self.canvas.delete("all")
        self.canvas.create_image(0, 0, anchor="nw", image=self.tk_image)
        self.guide_line = self.canvas.create_line(0, 0, dw, 0, fill="red", width=1)

        self.status.config(
            text=f"[{self.index + 1}/{len(self.files)}] {path.name} — click the bottom of the tires"
        )

    def on_move(self, event):
        if self.guide_line is not None:
            self.canvas.coords(self.guide_line, 0, event.y, self.canvas.winfo_width(), event.y)

    def on_click(self, event):
        path = self.files[self.index]
        crop_y = max(1, int(event.y / self.scale))
        cropped = self.original.crop((0, 0, self.original.width, crop_y))

        OUTPUT_DIR.mkdir(exist_ok=True)
        out_path = OUTPUT_DIR / path.name
        save_kwargs = {"lossless": True} if path.suffix.lower() == ".webp" else {}
        cropped.save(out_path, **save_kwargs)

        print(f"{path.name}: cropped at y={crop_y} -> {cropped.width}x{cropped.height} -> {out_path}")

        self.index += 1
        self.load_current()


def main():
    INPUT_DIR.mkdir(exist_ok=True)
    files = sorted(
        (p for p in INPUT_DIR.iterdir() if p.suffix.lower() in (".png", ".webp")),
        key=natural_key,
    )
    if not files:
        print(f"No .png/.webp files found in {INPUT_DIR}")
        return

    root = tk.Tk()
    root.title("Click-to-crop tool")
    CropTool(root, files)
    root.mainloop()


if __name__ == "__main__":
    main()
