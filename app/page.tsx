import Image from "next/image";
import Link from "next/link";
import { SwishLogo, SwishMark } from "@/components/brand/Logo";
import { HeroBackground } from "@/components/HeroBackground";

/**
 * Marks are pre-processed to a single silhouette on transparency — see
 * scripts/prepare-sponsor-logos.py. They arrived as a blue drop on black,
 * a dark mark on white and white dots on near-black; dropped in raw, one
 * carried a white card and one vanished. Reduced to silhouettes they tint
 * with the hero instead of fighting it.
 */
const SPONSORS = [
  { name: "Sui", src: "/sponsors/sui.png" },
  { name: "World", src: "/sponsors/world.png" },
  { name: "Intercepta", src: "/sponsors/intercepta.png" },
];

export default function Home() {
  return (
    <main className="relative min-h-dvh overflow-hidden">
      <HeroBackground />

      {/* The gradient rises to near-white at the bottom, which is lovely
          behind a headline and illegible behind body text. This holds the
          lower half back so the copy keeps its contrast. */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            "linear-gradient(180deg, rgba(5,7,12,0.35) 0%, rgba(5,7,12,0) 28%, rgba(5,7,12,0.55) 72%, rgba(5,7,12,0.88) 100%)",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-5xl flex-col px-6">
        <header className="flex items-center justify-between py-7">
          <SwishLogo size={20} />
          <Link href="/wallet" className="glass-chip glass-chip-hover text-[13px] font-medium">
            Open the wallet
            <span className="text-[var(--swish-sky)]">→</span>
          </Link>
        </header>

        {/*
          Copy left, mark right. The mark is set far larger than the text
          because at matching weights the two compete and the eye settles
          on neither; at this size it reads as the surface the words sit
          on. It stacks above the copy on narrow screens, where a column
          of text beside anything is just two cramped columns.
        */}
        <section className="grid flex-1 items-center gap-10 py-14 md:grid-cols-[1fr_auto] md:gap-8">
          <div className="order-2 text-center md:order-1 md:text-left">
            <h1 className="fade-up font-display hero-title text-balance text-[44px] leading-[1.05] sm:text-[60px] lg:text-[68px]">
              The only wallet you will ever need for the agentic economy.
            </h1>

            <p
              className="fade-up mt-7 max-w-md text-balance text-[18px] leading-relaxed text-[var(--swish-sky)] md:mx-0"
              style={{ animationDelay: "80ms" }}
            >
              An agent can only spend what it said it would.
            </p>

            <div
              className="fade-up mt-9 flex flex-wrap items-center justify-center gap-3 md:justify-start"
              style={{ animationDelay: "140ms" }}
            >
              <Link
                href="/wallet"
                className="btn btn-primary btn-lg shadow-[0_8px_30px_-8px_rgba(238,243,255,0.45)]"
              >
                Open the wallet
              </Link>
              <a href="https://github.com/Khalid-000-ME/swish" className="btn btn-secondary btn-lg">
                View source
              </a>
            </div>
          </div>

          <div className="fade-up order-1 flex justify-center md:order-2 md:justify-end">
            <SwishMark fluid size={420} className="w-[62vw] max-w-[420px] md:w-[34vw] md:max-w-none" />
          </div>
        </section>

        <footer className="fade-up pb-12" style={{ animationDelay: "200ms" }}>
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-9 gap-y-5">
            {SPONSORS.map((s) => (
              <span key={s.name} className="group flex items-center gap-2.5">
                <Image
                  src={s.src}
                  alt=""
                  width={20}
                  height={20}
                  className="opacity-50 transition group-hover:opacity-85"
                />
                <span className="text-[13px] font-medium text-[var(--swish-fg-dim)]">{s.name}</span>
              </span>
            ))}
          </div>
        </footer>
      </div>
    </main>
  );
}
