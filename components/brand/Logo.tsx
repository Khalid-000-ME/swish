import Image from "next/image";

/**
 * The Swish mark.
 *
 * The source PNG is a square with the glyph sitting small in the middle of
 * a lot of black padding — fine as a file, useless at 28px in a navbar,
 * where it would render as a dark square with a smudge in it. So the image
 * is scaled up inside an overflow-hidden tile and the tile is what gets
 * rounded: the artwork's own black becomes the tile's fill, which lands
 * exactly on --bind-black, and the corners round cleanly without needing a
 * second asset.
 *
 * `priority` is on by default because this sits in the header of every
 * page — it's above the fold everywhere, and lazy-loading it just makes
 * the chrome assemble itself in front of the person.
 */
export function SwishMark({
  size = 28,
  className = "",
  priority = true,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <span
      className={`relative inline-block flex-none overflow-hidden bg-[var(--bind-black)] ${className}`}
      style={{
        width: size,
        height: size,
        // Scales with the mark rather than being a fixed radius, so it
        // reads the same as a 20px favicon and as a 96px hero tile.
        borderRadius: Math.max(6, Math.round(size * 0.28)),
      }}
    >
      <Image
        src="/swish_logo.png"
        alt=""
        width={size}
        height={size}
        priority={priority}
        // 1.9x is what it takes to bring the glyph out to the tile edges;
        // the artwork is padded to roughly half the frame.
        className="absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2"
        style={{ width: size * 1.9, height: size * 1.9 }}
      />
    </span>
  );
}

/** Mark plus name, for headers. The name is the wordmark, not a heading. */
export function SwishLogo({
  size = 28,
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
        <span className="text-[15px] font-semibold tracking-tight text-[var(--bind-fg)]">Swish</span>
      )}
    </span>
  );
}
