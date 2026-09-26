import Link from "next/link";
import { SwishConsole } from "@/components/SwishConsole";

export default function AppPage() {
  return (
    <main className="relative min-h-dvh bg-[var(--swish-black)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-40"
        style={{ background: "radial-gradient(60% 100% at 50% 0%, var(--swish-navy-2), transparent)" }}
      />
      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-medium text-[var(--swish-fg)]">
          <span className="dot" style={{ background: "var(--swish-accent-2)" }} />
          Swish
        </Link>
        <span className="chip bg-white/5 text-[var(--swish-fg-faint)]">Sui · World · Intercepta</span>
      </header>
      <div className="relative z-10">
        <SwishConsole />
      </div>
    </main>
  );
}
