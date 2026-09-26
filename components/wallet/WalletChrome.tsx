"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { WalletSnapshot } from "./types";
import { fmtSui } from "./types";
import { SourceBadge } from "./bits";
import { ExplorerLink } from "./ExplorerLink";
import { SwishLogo } from "@/components/brand/Logo";
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
    <main className="relative min-h-dvh bg-[var(--swish-black)]">
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-72 opacity-40"
        style={{ background: "radial-gradient(70% 100% at 50% 0%, var(--swish-navy-2), transparent)" }}
      />

      <div className="relative z-10">
        <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-5 py-4">
          {back ? (
            <Link
              href={back.href}
              className="flex items-center gap-1.5 text-sm text-[var(--swish-fg-dim)] transition hover:text-[var(--swish-fg)]"
            >
              <span>←</span>
              {back.label}
            </Link>
          ) : (
            <Link href="/" className="transition hover:opacity-80">
              <SwishLogo size={17} />
            </Link>
          )}

          {title && <span className="text-sm font-medium text-[var(--swish-fg)]">{title}</span>}

          <div className="flex items-center gap-2">
            {snap.operator.address && (
              <span className="chip text-[11px] text-[var(--swish-fg-dim)]">
                <span className="dot" style={{ background: "var(--swish-ok)" }} />
                <ExplorerLink
                  value={snap.operator.address}
                  kind="address"
                  className="font-mono text-[11px] text-[var(--swish-fg-dim)] transition hover:text-[var(--swish-accent-2)]"
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
            <StartOver snap={snap} />
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
function StartOver({ snap }: { snap: WalletSnapshot }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState<null | "sweep" | "reset">(null);
  const [error, setError] = useState<string | null>(null);

  // Agents still holding SUI in their own addresses. Resetting forgets
  // them, and the wallet has no way to reach an agent it has forgotten —
  // the key survives in the server's keystore, but nothing in the UI can
  // find it again. Saying "nothing on chain changes" was true and
  // useless: the money stays exactly where it is, permanently out of
  // reach.
  const holding = snap.agents.filter((a) => BigInt(a.addressBalanceMist) > 0n);
  const total = holding.reduce((n, a) => n + BigInt(a.addressBalanceMist), 0n);

  async function sweep() {
    setBusy("sweep");
    setError(null);
    try {
      for (const agent of holding) {
        const res = await fetch("/api/wallet/move", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ direction: "agent_to_operator", agentId: agent.id, all: true }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(`${agent.name}: ${body.error ?? "couldn't recover its funds"}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    setBusy("reset");
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
        className="text-[11px] text-[var(--swish-fg-faint)] underline decoration-[var(--swish-line)] underline-offset-2 transition hover:text-[var(--swish-fg-dim)]"
      >
        Start over
      </button>
    );
  }

  return (
    <div className="inline-flex flex-col items-center gap-1.5">
      <p className="max-w-sm text-[11px] leading-relaxed text-[var(--swish-fg-dim)]">
        This drops your agents and runs onboarding again. The vault, its allow-list and its balance
        are untouched — they live on chain and belong to your key, not to an agent.
      </p>

      {holding.length > 0 && (
        <p
          className="max-w-sm rounded-lg px-3 py-2 text-[11px] leading-relaxed"
          style={{ background: "var(--swish-warn-dim)", color: "var(--swish-fg-dim)" }}
        >
          <strong style={{ color: "var(--swish-warn)" }}>
            {holding.length === 1 ? holding[0].name : `${holding.length} agents`} still{" "}
            {holding.length === 1 ? "holds" : "hold"} {fmtSui(total, 4)} SUI.
          </strong>{" "}
          Once the wallet forgets an agent it can&apos;t reach that address again. Recover it first.
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {holding.length > 0 && (
          <button disabled={busy !== null} onClick={sweep} className="btn btn-primary btn-sm">
            {busy === "sweep" ? "Recovering…" : "Recover funds to your key"}
          </button>
        )}
        <button disabled={busy !== null} onClick={reset} className="btn btn-danger btn-sm">
          {busy === "reset" ? "Clearing…" : holding.length > 0 ? "Start over anyway" : "Yes, start over"}
        </button>
        <button onClick={() => setArmed(false)} className="btn btn-secondary btn-sm">
          Keep it
        </button>
      </div>

      {error && (
        <p className="max-w-sm text-[11px] leading-relaxed" style={{ color: "var(--swish-danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
