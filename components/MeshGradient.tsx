/**
 * Reproduces the reference hero texture: a black-to-royal-blue-to-mist
 * vertical gradient, a fine film-grain overlay (SVG feTurbulence, not a
 * bitmap — stays sharp at any size), and the faint dotted column dividers
 * from the source image.
 */
export function MeshGradient({ columns = 6 }: { columns?: number }) {
  const gap = 100 / columns;
  const lines = Array.from({ length: columns - 1 }, (_, i) => gap * (i + 1));

  return (
    <div className="mesh-gradient absolute inset-0 overflow-hidden">
      <svg
        className="mesh-grain"
        viewBox="0 0 200 200"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <filter id="bind-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves={2}
            stitchTiles="stitch"
            result="noise"
          />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0" />
        </filter>
        <rect width="200" height="200" filter="url(#bind-grain)" />
      </svg>

      <svg
        className="mesh-columns"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {lines.map((x) => (
          <line
            key={x}
            x1={x}
            y1={0}
            x2={x}
            y2={100}
            stroke="var(--bind-mist)"
            strokeWidth={0.12}
            strokeDasharray="0.5 1.6"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
}
