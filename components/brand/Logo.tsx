import Image from "next/image";

/**
 * The Swish mark.
 *
 * Draws `public/swish-mark.png`, which is the glyph alone on transparency,
 * already squared and padded by scripts/make-favicon.py.
 *
 * The previous version took the raw logo — a wide glyph sitting in a lot
 * of black padding — and scaled it 1.9x inside a clipped tile to fill the
 * frame. That was the wrong shape of fix: the glyph is roughly 780x270, so
 * enlarging it until it filled a square vertically pushed its ends off
 * both sides, and the mark showed up zoomed and clipped. Framing the asset
 * once means this can simply draw it at its own aspect ratio.
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
      className={`inline-flex flex-none items-center justify-center bg-[var(--bind-black)] ${className}`}
      style={{
        width: size,
        height: size,
        // Scales with the mark rather than being a fixed radius, so it
        // reads the same at 20px and at 96px.
        borderRadius: Math.max(6, Math.round(size * 0.26)),
      }}
    >
      <Image
        src="/swish-mark.png"
        alt=""
        width={size}
        height={size}
        priority={priority}
        style={{ width: size, height: size }}
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
