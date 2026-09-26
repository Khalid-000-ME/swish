import Link from "next/link";
import { BindConsole } from "@/components/BindConsole";

export default function AppPage() {
  return (
    <main className="relative min-h-dvh bg-[var(--bind-black)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-40"
        style={{ background: "radial-gradient(60% 100% at 50% 0%, var(--bind-navy-2), transparent)" }}
      />
      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-medium text-[var(--bind-fg)]">
          <span className="dot" style={{ background: "var(--bind-accent-2)" }} />
          Bind
        </Link>
        <span className="chip bg-white/5 text-[var(--bind-fg-faint)]">Sui · World · Intercepta</span>
      </header>
      <div className="relative z-10">
        <BindConsole />
      </div>
    </main>
  );
}
