#!/usr/bin/env python3
"""Normalises the sponsor marks for the hero.

They arrive in three formats with three different backgrounds: Sui as a blue
drop on black in AVIF, World as a dark mark on white in JPEG, Intercepta as
white dots on near-black. Dropped into the hero as-is, one of them carries a
white card, one disappears into the background, and they read as three logos
borrowed from three places rather than a row.

So each is reduced to its own silhouette on transparency: sample the corners
to learn which end of the range is background, threshold against that, and
paint the mark in a single colour. Tinting then happens in CSS, where it can
follow the palette instead of being baked in.

    python3 scripts/prepare-sponsor-logos.py

Writes public/sponsors/*.png. Re-run after replacing a source file.
"""
import subprocess, sys, tempfile
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "sponsors"
SIZE = 256
# Painted in the palette's pale mist; CSS controls the final opacity.
INK = (238, 243, 255)

SOURCES = {
    "sui": "sui_logo.avif",
    "world": "world_logo.jpg",
    "intercepta": "intercepta_logo.jpeg",
}


def load(path: Path) -> Image.Image:
    if path.suffix.lower() != ".avif":
        return Image.open(path).convert("RGBA")
    # Pillow has no AVIF decoder here; ffmpeg does.
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(path), "-frames:v", "1", tmp.name],
            check=True,
        )
        return Image.open(tmp.name).convert("RGBA")


def silhouette(im: Image.Image) -> Image.Image:
    im = im.resize((SIZE, SIZE), Image.LANCZOS)
    grey = im.convert("L")
    px = grey.load()

    # The corners are background in all three of these marks.
    corners = [px[0, 0], px[SIZE - 1, 0], px[0, SIZE - 1], px[SIZE - 1, SIZE - 1]]
    bg = sum(corners) / 4
    dark_bg = bg < 128

    # Distance from the background, so anti-aliased edges stay soft instead
    # of turning into stair-steps.
    alphas = []
    for y in range(SIZE):
        row = []
        for x in range(SIZE):
            v = px[x, y]
            a = (v - bg) / (255 - bg) if dark_bg else (bg - v) / bg
            row.append(max(0.0, min(1.0, a)))
        alphas.append(row)

    # Sui's blue sits mid-grey against black, so its raw distance never
    # reaches 1 and the mark renders visibly lighter than the other two.
    # Stretching each to its own peak makes them carry equal weight, which
    # is the whole point of processing them together.
    peak = max(max(row) for row in alphas) or 1.0

    out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    op = out.load()
    for y in range(SIZE):
        for x in range(SIZE):
            a = min(1.0, alphas[y][x] / peak)
            if a > 0.02:
                op[x, y] = (*INK, int(a * 255))
    return out


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, filename in SOURCES.items():
        src = ROOT / "public" / filename
        if not src.exists():
            print(f"!! missing {src}", file=sys.stderr)
            return 1
        mark = silhouette(load(src))
        dest = OUT / f"{name}.png"
        mark.save(dest)
        opaque = sum(1 for p in mark.getdata() if p[3] > 8)
        print(f"{name:11} {dest.relative_to(ROOT)}  {opaque / (SIZE * SIZE):.0%} coverage")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
