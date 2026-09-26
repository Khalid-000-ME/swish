"use client";

import Grainient from "./Grainient";

/**
 * The hero's backdrop.
 *
 * This replaces a hand-rolled SVG version whose grain came from a 200×200
 * feTurbulence tile stretched across the whole viewport with
 * preserveAspectRatio="none" — so at hero size each noise pixel was blown
 * up to a visible blob and the texture read as a low-resolution crop
 * rather than film grain. Grainient renders the gradient and its grain per
 * device pixel in a fragment shader, so it stays fine at any size and
 * moves.
 *
 * The three colours are the project's own tokens, in the order the shader
 * wants them (light → mid → dark), so the palette is unchanged from the
 * CSS version it replaces:
 *
 *   --bind-mist   #eef3ff   the pale top-of-frame light
 *   --bind-accent #2454e8   the royal blue that carries the middle
 *   --bind-black  #05070c   the near-black everything sits on
 *
 * The dotted column dividers from the original reference stay on top as
 * plain SVG — they're a layout motif, not part of the gradient, and they
 * cost nothing.
 */
export function HeroBackground({ columns = 6 }: { columns?: number }) {
  const gap = 100 / columns;
  const lines = Array.from({ length: columns - 1 }, (_, i) => gap * (i + 1));

  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--bind-black)]">
      <Grainient
        color1="#eef3ff"
        color2="#2454e8"
        color3="#05070c"
        // Slow enough to read as weather rather than animation — it should
        // be something you notice on the second look, not the first.
        timeSpeed={0.12}
        warpSpeed={0.9}
        warpFrequency={3.4}
        warpAmplitude={64}
        // Pushes the blend so black holds most of the frame and the blue
        // and light sit where the old linear-gradient put them.
        colorBalance={0.22}
        blendSoftness={0.22}
        rotationAmount={140}
        noiseScale={1.6}
        // Real grain, moving, at a scale that stays fine on a 4K display.
        grainAmount={0.055}
        grainScale={620}
        grainAnimated
        contrast={1.22}
        saturation={1.05}
        zoom={1.15}
        centerY={-0.08}
      />

      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-40"
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
