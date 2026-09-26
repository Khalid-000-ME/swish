import Image from "next/image";
import Link from "next/link";
import { SwishLogo } from "@/components/brand/Logo";
import { HeroBackground } from "@/components/HeroBackground";

/**
 * Marks are pre-processed to a single silhouette on transparency — see
 * scripts/prepare-sponsor-logos.py. They arrived as a blue drop on black,
 * a dark mark on white and white dots on near-black; dropped in raw, one
 * carried a white card and one vanished. Reduced to silhouettes they tint
 * with the hero instead of fighting it.
 */
const SPONSORS = [
  { name: "Sui", role: "Enforcement", src: "/sponsors/sui.png" },
  { name: "World", role: "Human override", src: "/sponsors/world.png" },
  { name: "Intercepta", role: "Screening", src: "/sponsors/intercepta.png" },
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
          <SwishLogo size={32} />
          <Link href="/wallet" className="glass-chip glass-chip-hover text-[13px] font-medium">
            Open the wallet
            <span className="text-[var(--bind-sky)]">→</span>
          </Link>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center py-16 text-center">
          <p className="fade-up glass-chip mb-8 text-[12px]">
            <span className="pulse-dot" style={{ background: "var(--bind-danger)" }} />
            <span className="text-[var(--bind-fg-dim)]">Grok/Bankr wallet</span>
            <span className="font-num text-[var(--bind-mist)]">$330K</span>
            <span className="text-[var(--bind-fg-faint)]">then</span>
            <span className="font-num text-[var(--bind-mist)]">$175K</span>
            <span className="text-[var(--bind-fg-faint)]">again</span>
          </p>

          <h1 className="fade-up font-display hero-title max-w-3xl text-balance text-6xl leading-[1.02] sm:text-[80px]">
            An agent can only spend
            <br />
            what it said it would.
          </h1>

          <p
            className="fade-up mt-8 max-w-xl text-balance text-[17px] leading-relaxed text-[var(--bind-sky)]"
            style={{ animationDelay: "80ms" }}
          >
            Fund a vault, hand it to your AI agent. Every payment is diffed against its own declared
            intent before it can move — and the guard is an object the chain has to consume, not a
            check a future rewrite can quietly drop.
          </p>

          <div
            className="fade-up mt-11 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: "140ms" }}
          >
            <Link
              href="/wallet"
              className="rounded-full bg-[var(--bind-mist)] px-7 py-3.5 text-sm font-semibold text-[var(--bind-black)] shadow-[0_8px_30px_-8px_rgba(238,243,255,0.5)] transition hover:-translate-y-px hover:shadow-[0_12px_38px_-8px_rgba(238,243,255,0.65)]"
            >
              Open the wallet
            </Link>
            <a
              href="https://github.com/Khalid-000-ME/swish"
              className="glass-chip glass-chip-hover px-7 py-3.5 text-sm font-semibold text-[var(--bind-mist)]"
            >
              View source
            </a>
          </div>
        </section>

        <footer className="fade-up pb-12" style={{ animationDelay: "200ms" }}>
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-9 gap-y-5">
            {SPONSORS.map((s) => (
              <span key={s.name} className="group flex items-center gap-2.5">
                <Image
                  src={s.src}
                  alt=""
                  width={22}
                  height={22}
                  className="opacity-55 transition group-hover:opacity-90"
                />
                <span className="text-left leading-tight">
                  <span className="block text-[13px] font-medium text-[var(--bind-fg-dim)]">
                    {s.name}
                  </span>
                  <span className="block text-[10.5px] uppercase tracking-[0.14em] text-[var(--bind-fg-faint)]">
                    {s.role}
                  </span>
                </span>
              </span>
            ))}
          </div>
        </footer>
      </div>
    </main>
  );
}
