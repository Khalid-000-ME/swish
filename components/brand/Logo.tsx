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
}: {
  /** Height in px. */
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  const width = Math.round(size * ASPECT);
  return (
    <Image
      src="/swish-glyph.png"
      alt=""
      width={width}
      height={size}
      priority={priority}
      className={`flex-none ${className}`}
      style={{ width, height: size }}
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
          className="font-semibold tracking-tight text-[var(--bind-fg)]"
          style={{ fontSize: Math.round(size * 1.25) }}
        >
          Swish
        </span>
      )}
    </span>
  );
}
