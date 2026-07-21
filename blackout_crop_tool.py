#!/usr/bin/env python3
"""Blackout & Crop tool: paint pure black over glow artifacts (invisible under mix-blend-mode: screen)."""

import re
import tkinter as tk
from pathlib import Path

from PIL import Image, ImageDraw, ImageTk

INPUT_DIR = Path(__file__).parent / "input_cars"
OUTPUT_DIR = Path(__file__).parent / "output_cars"
MAX_DISPLAY_SIZE = (1000, 700)
IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp")
BRUSH_MIN, BRUSH_MAX, BRUSH_STEP = 4, 300, 4
MAX_HISTORY = 30


def natural_key(path: Path):
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", path.stem)]


def open_working_image(path: Path) -> Image.Image:
    img = Image.open(path)
    has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    return img.convert("RGBA") if has_alpha else img.convert("RGB")


class BlackoutTool:
    def __init__(self, root, files):
        self.root = root
        self.files = files
        self.index = 0
        self.brush_size = 30
        self.history = []
        self.dragging = False
        self.last_point = None

        self.canvas = tk.Canvas(root, cursor="none")
        self.canvas.pack()
        self.status = tk.Label(root, font=("Helvetica", 12))
        self.status.pack(fill="x")

        self.canvas.bind("<ButtonPress-1>", self.on_paint_start)
        self.canvas.bind("<B1-Motion>", self.on_paint_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_paint_end)
        self.canvas.bind("<Button-2>", self.on_horizontal_blackout)
        self.canvas.bind("<Button-3>", self.on_horizontal_blackout)
        self.canvas.bind("<Motion>", self.on_hover)
        self.canvas.bind("<MouseWheel>", self.on_wheel)
        self.canvas.bind("<Button-4>", lambda e: self.change_brush(BRUSH_STEP))
        self.canvas.bind("<Button-5>", lambda e: self.change_brush(-BRUSH_STEP))

        root.bind("<space>", self.save_and_next)
        root.bind("<Return>", self.save_and_next)
        root.bind("<KeyPress-z>", self.undo)
        root.bind("<KeyPress-Z>", self.undo)
        root.bind("<bracketleft>", lambda e: self.change_brush(-BRUSH_STEP))
        root.bind("<bracketright>", lambda e: self.change_brush(BRUSH_STEP))

        self.brush_cursor = self.canvas.create_oval(0, 0, 0, 0, outline="red", width=1, tags="cursor")
        self.load_current()

    def load_current(self):
        if self.index >= len(self.files):
            self.status.config(text=f"Done. {len(self.files)} images saved to {OUTPUT_DIR}")
            self.canvas.delete("all")
            return

        path = self.files[self.index]
        self.image = open_working_image(path)
        self.black = (0, 0, 0, 255) if self.image.mode == "RGBA" else (0, 0, 0)
        ow, oh = self.image.size

        self.scale = min(MAX_DISPLAY_SIZE[0] / ow, MAX_DISPLAY_SIZE[1] / oh, 1.0)
        self.canvas.config(width=int(ow * self.scale), height=int(oh * self.scale))

        self.history = []
        self.dragging = False
        self.last_point = None
        self.refresh_canvas()
        self.update_status()

    def refresh_canvas(self):
        dw = int(self.image.width * self.scale)
        dh = int(self.image.height * self.scale)
        display_img = self.image.resize((dw, dh)) if self.scale != 1.0 else self.image
        self.tk_image = ImageTk.PhotoImage(display_img)

        self.canvas.delete("pixmap")
        self.canvas.create_image(0, 0, anchor="nw", image=self.tk_image, tags="pixmap")
        self.canvas.tag_lower("pixmap")
        self.canvas.coords(self.brush_cursor, 0, 0, 0, 0)

    def update_status(self):
        path = self.files[self.index]
        self.status.config(
            text=f"[{self.index + 1}/{len(self.files)}] {path.name}  |  brush={self.brush_size}px  "
            f"|  drag=paint  right-click=horizontal blackout  space=next  z=undo  [ ]=brush size"
        )

    def to_original(self, event):
        return event.x / self.scale, event.y / self.scale

    def push_history(self):
        self.history.append(self.image.copy())
        if len(self.history) > MAX_HISTORY:
            self.history.pop(0)

    def paint_dab(self, x, y):
        draw = ImageDraw.Draw(self.image)
        r = self.brush_size / 2
        draw.ellipse((x - r, y - r, x + r, y + r), fill=self.black)

    def paint_line(self, x0, y0, x1, y1):
        draw = ImageDraw.Draw(self.image)
        draw.line((x0, y0, x1, y1), fill=self.black, width=self.brush_size)
        self.paint_dab(x1, y1)

    def on_paint_start(self, event):
        self.push_history()
        self.dragging = True
        x, y = self.to_original(event)
        self.last_point = (x, y)
        self.paint_dab(x, y)
        self.refresh_canvas()
        self.move_brush_cursor(event.x, event.y)

    def on_paint_drag(self, event):
        if not self.dragging:
            return
        x, y = self.to_original(event)
        x0, y0 = self.last_point
        self.paint_line(x0, y0, x, y)
        self.last_point = (x, y)
        self.refresh_canvas()
        self.move_brush_cursor(event.x, event.y)

    def on_paint_end(self, event):
        self.dragging = False
        self.last_point = None

    def on_horizontal_blackout(self, event):
        self.push_history()
        _, y = self.to_original(event)
        draw = ImageDraw.Draw(self.image)
        draw.rectangle((0, y, self.image.width, self.image.height), fill=self.black)
        self.refresh_canvas()
        self.move_brush_cursor(event.x, event.y)

    def on_hover(self, event):
        self.move_brush_cursor(event.x, event.y)

    def move_brush_cursor(self, cx, cy):
        r = (self.brush_size / 2) * self.scale
        self.canvas.coords(self.brush_cursor, cx - r, cy - r, cx + r, cy + r)
        self.canvas.tag_raise("cursor")

    def change_brush(self, delta):
        self.brush_size = max(BRUSH_MIN, min(BRUSH_MAX, self.brush_size + delta))
        self.update_status()

    def on_wheel(self, event):
        self.change_brush(BRUSH_STEP if event.delta > 0 else -BRUSH_STEP)

    def undo(self, event=None):
        if not self.history:
            return
        self.image = self.history.pop()
        self.refresh_canvas()

    def save_and_next(self, event=None):
        path = self.files[self.index]
        OUTPUT_DIR.mkdir(exist_ok=True)
        out_path = OUTPUT_DIR / path.name
        suffix = path.suffix.lower()
        if suffix == ".webp":
            save_kwargs = {"lossless": True}
        elif suffix in (".jpg", ".jpeg"):
            save_kwargs = {"quality": 95}
        else:
            save_kwargs = {}
        self.image.save(out_path, **save_kwargs)
        print(f"{path.name}: saved -> {out_path}")

        self.index += 1
        self.load_current()


def main():
    INPUT_DIR.mkdir(exist_ok=True)
    files = sorted(
        (p for p in INPUT_DIR.iterdir() if p.suffix.lower() in IMAGE_EXTS),
        key=natural_key,
    )
    if not files:
        print(f"No .png/.webp files found in {INPUT_DIR}")
        return

    root = tk.Tk()
    root.title("Blackout & Crop tool")
    BlackoutTool(root, files)
    root.mainloop()


if __name__ == "__main__":
    main()
