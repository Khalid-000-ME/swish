#!/usr/bin/env python3
"""Rounds the corners of the README banner, in place.

GitHub strips style attributes and class names from README HTML, so
border-radius is not available — the rounding has to be in the pixels. An
alpha mask does it: the corners become transparent and take whatever the
reader's page background is, light or dark.

Also resizes. The source is 2020px wide and full of grain, which PNG
compresses badly; a README never renders it wider than about 900 CSS px,
so carrying 2MB for it is waste on every clone.

    python3 scripts/make-banner.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BANNER = ROOT / "public" / "banner.png"
SOURCE = ROOT / "public" / "banner-source.png"
WIDTH = 1200
# Proportional to height, so it reads the same as the app's own cards.
RADIUS_RATIO = 0.11


def main() -> None:
    # Keep an unrounded original the first time, so re-running doesn't
    # round already-rounded corners into a smaller and smaller arc.
    if not SOURCE.exists():
        BANNER.rename(SOURCE)
    src = Image.open(SOURCE).convert("RGBA")

    height = round(WIDTH * src.height / src.width)
    img = src.resize((WIDTH, height), Image.LANCZOS)

    radius = round(height * RADIUS_RATIO)
    mask = Image.new("L", (WIDTH, height), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, WIDTH - 1, height - 1), radius=radius, fill=255)

    # The grain is what makes this expensive — every pixel differs from its
    # neighbour, so PNG's filters have nothing to predict. Quantising the
    # colour keeps the texture visible while giving the encoder something
    # to work with. Done on RGB, before the mask goes on: PIL can only
    # quantise RGBA by octree, which handles a gradient like this badly.
    flat = img.convert("RGB").quantize(colors=128, method=Image.MEDIANCUT).convert("RGB")

    out = flat.convert("RGBA")
    out.putalpha(mask)
    out.save(BANNER, optimize=True)

    print(f"{WIDTH}x{height}, radius {radius}px, {BANNER.stat().st_size / 1024:.0f}KB")


if __name__ == "__main__":
    main()
