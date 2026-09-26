import Link from "next/link";
import { BindLogo } from "@/components/brand/Logo";
import { HeroBackground } from "@/components/HeroBackground";

const SPONSORS = [
  { name: "Sui", role: "object-consumption enforcement" },
  { name: "World", role: "human-verified override" },
  { name: "Intercepta", role: "pre-signature screening" },
];

export default function Home() {
  return (
    <main className="relative min-h-dvh overflow-hidden">
      <HeroBackground />

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-5xl flex-col px-6">
        <header className="flex items-center justify-between py-7">
          <BindLogo size={30} />
          <Link
            href="/wallet"
            className="chip bg-white/5 text-[var(--bind-fg)] transition hover:bg-white/10"
          >
            Open the wallet →
          </Link>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center py-16 text-center">
          <p className="fade-up chip mb-7 bg-white/5 text-[var(--bind-fg-dim)]">
            <span className="dot" style={{ background: "var(--bind-danger)" }} />
            Grok/Bankr wallet — $330K, then $175K again
          </p>

          <h1 className="fade-up font-display max-w-3xl text-balance text-6xl leading-[1.05] text-[var(--bind-mist)] sm:text-7xl">
            An agent can only spend<br />what it said it would.
          </h1>

          <p
            className="fade-up mt-7 max-w-xl text-balance text-lg leading-relaxed text-[var(--bind-fg-dim)]"
            style={{ animationDelay: "80ms" }}
          >
            Fund a vault, hand it to your AI agent. Every payment is diffed against its own
            declared intent before it can move — and the guard is an object your chain has to
            consume, not a check a future rewrite can quietly drop.
          </p>

          <div
            className="fade-up mt-10 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: "140ms" }}
          >
            <Link
              href="/wallet"
              className="rounded-full px-6 py-3 text-sm font-semibold text-[var(--bind-black)] transition hover:opacity-90"
              style={{ background: "var(--bind-mist)" }}
            >
              Open the wallet
            </Link>
            <a
              href="https://github.com/Khalid-000-ME/swish"
              className="rounded-full border px-6 py-3 text-sm font-semibold text-[var(--bind-mist)] transition hover:bg-white/5"
              style={{ borderColor: "var(--bind-line-strong)" }}
            >
              View source
            </a>
          </div>
        </section>

        <footer
          className="fade-up flex flex-wrap items-center justify-center gap-2 pb-10 text-xs text-[var(--bind-fg-faint)]"
          style={{ animationDelay: "200ms" }}
        >
          {SPONSORS.map((s) => (
            <span key={s.name} className="chip bg-black/20 text-[var(--bind-fg-dim)]">
              <span className="dot" style={{ background: "var(--bind-accent-2)" }} />
              {s.name}
              <span className="text-[var(--bind-fg-faint)]">· {s.role}</span>
            </span>
          ))}
        </footer>
      </div>
    </main>
  );
}
