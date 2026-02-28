#!/usr/bin/env python3
"""Generate favicon PNGs for Nathan Curtis portfolio site."""

from PIL import Image, ImageDraw, ImageFont

BG = (9, 9, 11)
ACCENT = (91, 159, 192)
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def make_favicon(size, font_size, text="N", filename=""):
    img = Image.new("RGB", (size, size), BG)
    draw = ImageDraw.Draw(img)

    font = ImageFont.truetype(FONT_PATH, font_size)
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]

    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1]

    draw.text((x, y), text, fill=ACCENT, font=font)

    img.save(filename)
    print(f"Generated {filename} ({size}x{size})")


make_favicon(32, 24, "N", "assets/favicon-32x32.png")
make_favicon(180, 120, "N", "assets/apple-touch-icon.png")
