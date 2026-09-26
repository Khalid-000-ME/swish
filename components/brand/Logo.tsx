import Image from "next/image";

/**
 * The Swish mark.
 *
 * Drawn bare, at its own proportions — the glyph is about 2.9:1, wide and
 * flat.
 *
 * It used to sit in a black rounded tile. Two problems with that. The
 * artwork was scaled up to fill the tile, which pushed the ends of a wide
 * glyph past the edges, so the mark rendered zoomed and clipped. And the
 * tile itself was a black square on a dark background, which reads as a
 * cropped thumbnail of something rather than as a logo. Removing it leaves
 * the mark, which is all there was ever meant to be.
 *
 * `size` is the height. Width follows the aspect ratio.
 *
 * `priority` is on by default because this sits in the header of every
 * page — it's above the fold everywhere, and lazy-loading it just makes
 * the chrome assemble itself in front of the person.
 */
const ASPECT = 778 / 270;

export function SwishMark({
  size = 12,
  className = "",
  priority = true,
  fluid = false,
}: {
  /** Height in px. Ignored when `fluid` — the container decides instead. */
  size?: number;
  className?: string;
  priority?: boolean;
  /**
   * Size to the container rather than to `size`.
   *
   * The fixed inline width is what keeps the mark crisp at chrome sizes,
   * but it also beats any width class handed in, so a responsive hero
   * mark silently rendered at 12px tall. `fluid` drops the inline width
   * and lets the className own it; `size` still sets the intrinsic
   * dimensions Next needs to build a srcset.
   */
  fluid?: boolean;
}) {
  const width = Math.round(size * ASPECT);
  return (
    <Image
      src="/swish-glyph.png"
      alt=""
      width={width}
      height={size}
      priority={priority}
      // The source is 1024px wide; without this Next picks a candidate off
      // its default srcset and a 20px-tall mark ends up resampled from
      // something barely larger than it, which softens the diagonals.
      quality={100}
      sizes={fluid ? "(max-width: 768px) 56vw, 30vw" : `${width * 3}px`}
      className={`${fluid ? "h-auto" : "flex-none"} ${className}`}
      style={fluid ? undefined : { width, height: size }}
    />
  );
}

/** Mark plus name, for headers. The name is the wordmark, not a heading. */
export function SwishLogo({
  size = 13,
  className = "",
  showName = true,
}: {
  size?: number;
  className?: string;
  showName?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <SwishMark size={size} />
      {showName && (
        <span
          className="font-semibold tracking-tight text-[var(--swish-fg)]"
          style={{ fontSize: Math.round(size * 1.25) }}
        >
          Swish
        </span>
      )}
    </span>
  );
}
