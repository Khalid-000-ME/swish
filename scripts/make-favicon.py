#!/usr/bin/env python3
"""Builds the favicon and the in-app mark from the Swish logo.

The source PNG has the glyph sitting small inside a lot of black padding.
At 32px that renders as a dark square with a smudge in it, which is why
the app scales it inside a clipped tile — a favicon gets no such wrapper,
so the crop has to be baked in.

Pillow's getbbox() is no help here: the source carries a bright hairline
along its edges, so the "bounding box of everything non-black" is most of
the image. So the frame is trimmed first, and any line that is almost
entirely bright is treated as a border rather than as glyph ink — the
mark is two solid bars with black around them and never fills a row.

    python3 scripts/make-favicon.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "swish_logo.png"
BRIGHT = 200
# Enough ink to count as part of the mark.
MIN_PIXELS = 6
# Past this, a line is the image's own border, not the glyph.
BORDER_RATIO = 0.9
# The hairline can be a few pixels thick after resampling.
TRIM = 4


def ink_box(img: Image.Image) -> tuple[int, int, int, int]:
    grey = img.convert("L").crop((TRIM, TRIM, img.width - TRIM, img.height - TRIM))
    w, h = grey.size
    px = grey.load()

    rows = [sum(1 for x in range(w) if px[x, y] > BRIGHT) for y in range(h)]
    cols = [sum(1 for y in range(h) if px[x, y] > BRIGHT) for x in range(w)]

    ys = [i for i, n in enumerate(rows) if MIN_PIXELS <= n < w * BORDER_RATIO]
    xs = [i for i, n in enumerate(cols) if MIN_PIXELS <= n < h * BORDER_RATIO]
    if not ys or not xs:
        raise SystemExit("no glyph found in the source image")
    return xs[0] + TRIM, ys[0] + TRIM, xs[-1] + TRIM, ys[-1] + TRIM


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    x0, y0, x1, y1 = ink_box(src)
    print(f"glyph at ({x0},{y0})-({x1},{y1}) in {src.size}")

    # Square, centred on the glyph, with breathing room so the mark reads
    # as a mark rather than as an edge-to-edge shape.
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    half = max(x1 - x0, y1 - y0) * 0.72
    crop = src.crop((int(cx - half), int(cy - half), int(cx + half), int(cy + half)))
    crop = crop.resize((512, 512), Image.LANCZOS)

    crop.save(ROOT / "app" / "icon.png")
    crop.save(ROOT / "app" / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("wrote app/icon.png and app/favicon.ico")

    # The in-app mark: the glyph alone, on transparency, centred in a square
    # with room around it.
    #
    # The component used to scale the padded source 1.9x inside a clipped
    # tile, which was the wrong shape of fix. The glyph is wide — roughly
    # 780x270 — so enlarging it until it filled a square tile vertically
    # pushed its ends off both sides. Framing it here means the component
    # can just draw it at its own aspect ratio.
    glyph = src.crop((x0, y0, x1 + 1, y1 + 1))
    grey = glyph.convert("L")
    transparent = Image.new("RGBA", glyph.size, (0, 0, 0, 0))
    tp, gp = transparent.load(), grey.load()
    for y in range(glyph.height):
        for x in range(glyph.width):
            a = gp[x, y] / 255
            if a > 0.02:
                tp[x, y] = (255, 255, 255, int(a * 255))

    side = int(max(glyph.size) * 1.14)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.alpha_composite(
        transparent, ((side - glyph.width) // 2, (side - glyph.height) // 2)
    )
    square.resize((512, 512), Image.LANCZOS).save(ROOT / "public" / "swish-mark.png")
    print(f"wrote public/swish-mark.png (glyph {glyph.size}, framed {side}x{side})")


if __name__ == "__main__":
    main()
