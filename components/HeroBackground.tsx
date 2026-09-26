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
 *   --swish-mist   #eef3ff   the pale top-of-frame light
 *   --swish-accent #2454e8   the royal blue that carries the middle
 *   --swish-black  #05070c   the near-black everything sits on
 *
 * The dotted column dividers from the original reference stay on top as
 * plain SVG — they're a layout motif, not part of the gradient, and they
 * cost nothing.
 */
export function HeroBackground({ columns = 6 }: { columns?: number }) {
  const gap = 100 / columns;
  const lines = Array.from({ length: columns - 1 }, (_, i) => gap * (i + 1));

  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--swish-black)]">
      <Grainient
        // Darker stops than the palette's literal values. The shader
        // blends toward its lightest colour across most of the frame, so
        // handing it pure mist and pure accent produced a wall of bright
        // blue with no black in it at all. Sky and deep navy keep the
        // near-black dominant, which is what the reference actually is.
        color1="#9fb9f5"
        color2="#12256e"
        color3="#05070c"
        // Slow enough to read as weather rather than animation — it should
        // be something you notice on the second look, not the first.
        timeSpeed={0.12}
        warpSpeed={0.9}
        warpFrequency={3.4}
        warpAmplitude={64}
        // Pushes the blend so black holds most of the frame and the blue
        // and light sit where the old linear-gradient put them.
        // Negative balance pushes the blend edges up the range, so the
        // dark stop covers the frame and the blue arrives as a glow rather
        // than a fill.
        colorBalance={-0.34}
        blendSoftness={0.3}
        rotationAmount={140}
        noiseScale={1.6}
        // The shader's own grain is subtle by design; on top of a gradient
        // this dark it was barely there. Pushed up, and doubled by a second
        // static layer below, because one moving grain reads as video noise
        // while grain over grain reads as film.
        grainAmount={0.16}
        grainScale={900}
        grainAnimated
        contrast={1.35}
        saturation={1.15}
        gamma={1.25}
        zoom={1.3}
        centerY={-0.22}
      />

      {/* A fine, still grain over the moving one. Tiled at its natural size
          rather than stretched, so a noise pixel stays a pixel — the mistake
          the SVG version made. */}
      <div className="hero-grain pointer-events-none absolute inset-0" />

      {/* Vignette. The shader's blue reaches the corners at full strength,
          which pulls the eye outward; this keeps the frame closed. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 85% at 50% 42%, transparent 30%, rgba(5,7,12,0.45) 78%, rgba(5,7,12,0.8) 100%)",
        }}
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
            stroke="var(--swish-mist)"
            strokeWidth={0.12}
            strokeDasharray="0.5 1.6"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
}
