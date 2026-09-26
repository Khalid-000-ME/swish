"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { WalletSnapshot } from "./types";
import { SourceBadge } from "./bits";
import { ExplorerLink } from "./ExplorerLink";
import { BindLogo } from "@/components/brand/Logo";
import { clearStoredWallet } from "./WalletShell";

/** The frame every wallet page sits in: a thin top bar with who you are
 *  and what's live, and a mesh glow behind it. Deliberately quiet — the
 *  page underneath is what people came for. */
export function WalletChrome({
  snap,
  back,
  title,
  children,
}: {
  snap: WalletSnapshot;
  back?: { href: string; label: string };
  title?: string;
  children: ReactNode;
}) {
  return (
    <main className="relative min-h-dvh bg-[var(--bind-black)]">
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-72 opacity-40"
        style={{ background: "radial-gradient(70% 100% at 50% 0%, var(--bind-navy-2), transparent)" }}
      />

      <div className="relative z-10">
        <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-5 py-4">
          {back ? (
            <Link
              href={back.href}
              className="flex items-center gap-1.5 text-sm text-[var(--bind-fg-dim)] transition hover:text-[var(--bind-fg)]"
            >
              <span>←</span>
              {back.label}
            </Link>
          ) : (
            <Link href="/" className="transition hover:opacity-80">
              <BindLogo size={28} />
            </Link>
          )}

          {title && <span className="text-sm font-medium text-[var(--bind-fg)]">{title}</span>}

          <div className="flex items-center gap-2">
            {snap.operator.address && (
              <span className="chip text-[11px] text-[var(--bind-fg-dim)]">
                <span className="dot" style={{ background: "var(--bind-ok)" }} />
                <ExplorerLink
                  value={snap.operator.address}
                  kind="address"
                  className="font-mono text-[11px] text-[var(--bind-fg-dim)] transition hover:text-[var(--bind-accent-2)]"
                />
              </span>
            )}
          </div>
        </header>

        {children}

        <footer className="mx-auto w-full max-w-2xl px-5 pb-8 pt-4">
          <div className="flex flex-wrap justify-center gap-1.5">
            <SourceBadge live={snap.chainLive} liveLabel="Sui testnet · live" simLabel="chain simulated" />
            <SourceBadge live={!snap.worldSandbox} liveLabel="World live" simLabel="World sandbox" />
          </div>
          <div className="mt-3 text-center">
            <StartOver />
          </div>
        </footer>
      </div>
    </main>
  );
}

/**
 * The way back out of onboarding.
 *
 * Onboarding ran once and there was no undo: the server won't re-onboard
 * while it holds a wallet, and the browser restores that same wallet on
 * every cold start. An agent that stopped working was therefore permanent
 * unless you knew to clear site data. Two clicks, because it throws away
 * agents.
 */
function StartOver() {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function reset() {
    setBusy(true);
    try {
      await fetch("/api/wallet/reset", { method: "POST" });
    } finally {
      // The browser's copy has to go too, or the next page load offers it
      // straight back to the server.
      clearStoredWallet();
      router.replace("/onboarding");
      router.refresh();
    }
  }

  if (!armed) {
    return (
      <button
        onClick={() => setArmed(true)}
        className="text-[11px] text-[var(--bind-fg-faint)] underline decoration-[var(--bind-line)] underline-offset-2 transition hover:text-[var(--bind-fg-dim)]"
      >
        Start over
      </button>
    );
  }

  return (
    <div className="inline-flex flex-col items-center gap-1.5">
      <p className="max-w-sm text-[11px] leading-relaxed text-[var(--bind-fg-dim)]">
        This drops your agents and runs onboarding again. Nothing on chain changes — the vault, its
        allow-list and any SUI you already sent stay where they are.
      </p>
      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={reset}
          className="rounded-full border px-3 py-1.5 text-[11px] font-medium transition disabled:opacity-40"
          style={{ borderColor: "var(--bind-danger)", color: "var(--bind-danger)" }}
        >
          {busy ? "Clearing…" : "Yes, start over"}
        </button>
        <button
          onClick={() => setArmed(false)}
          className="rounded-full border border-[var(--bind-line-strong)] px-3 py-1.5 text-[11px] text-[var(--bind-fg-dim)] transition hover:text-[var(--bind-fg)]"
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
