"use client";

import { useCallback, useEffect, useState } from "react";
import type { WalletSnapshot } from "@/components/wallet/types";
import { fmtSui, shortAddr } from "@/components/wallet/types";
import { TrustBars } from "@/components/wallet/bits";
import { SwishLogo } from "@/components/brand/Logo";
import { MeshGradient } from "@/components/MeshGradient";

interface ConnectionRow {
  id: string;
  origin: string;
  agentId: string;
  expiresAt: number;
  maxActions: number;
  actionsUsed: number;
  revokedAt?: number;
}

/**
 * The extension popup, rendered by the app itself and framed by the
 * extension.
 *
 * Doing it this way rather than rebuilding the popup in plain HTML means
 * there's one design system, one set of fonts and one place to change
 * them — the popup can't drift away from the wallet it belongs to.
 * Sized for a 360px frame, and everything that needs room opens the full
 * wallet in a tab.
 */
export default function PopupPage() {
  const [snap, setSnap] = useState<WalletSnapshot | null>(null);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, c] = await Promise.all([
        fetch("/api/wallet", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/wallet/connections", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setSnap(w);
      setConnections((c.connections ?? []).filter((x: ConnectionRow) => !x.revokedAt));
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [w, c] = await Promise.all([
          fetch("/api/wallet", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/wallet/connections", { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (!alive) return;
        setSnap(w);
        setConnections((c.connections ?? []).filter((x: ConnectionRow) => !x.revokedAt));
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (failed) {
    return (
      <Shell>
        <p className="px-1 text-[13px] leading-relaxed text-[var(--bind-fg-dim)]">
          Couldn&apos;t read the wallet. Is the server still running?
        </p>
      </Shell>
    );
  }

  if (!snap) {
    return (
      <Shell>
        <p className="px-1 text-[13px] text-[var(--bind-fg-faint)]">Opening…</p>
      </Shell>
    );
  }

  if (!snap.onboarding?.complete) {
    return (
      <Shell>
        <p className="mb-4 px-1 text-[13px] leading-relaxed text-[var(--bind-fg-dim)]">
          This wallet hasn&apos;t been set up yet. Hire your first agent and it&apos;ll show up here.
        </p>
        <Open href="/onboarding" label="Set up wallet" primary />
      </Shell>
    );
  }

  const needsYou = snap.approvals.length + snap.caught.length;

  return (
    <Shell>
      {/* balance */}
      <div className="px-1 text-center">
        <div className="font-num text-[42px] leading-none text-[var(--bind-mist)]">
          {fmtSui(snap.holdings.total, 3)}
          <span className="ml-1.5 text-lg text-[var(--bind-fg-dim)]">SUI</span>
        </div>
        <div className="mt-1.5 text-[11px] text-[var(--bind-fg-dim)]">
          <span className="font-num">{fmtSui(snap.holdings.vault, 3)}</span> in envelopes ·{" "}
          <span className="font-num">{fmtSui(snap.holdings.agents, 3)}</span> held by agents
        </div>
        {snap.operator.address && (
          <button
            onClick={() => navigator.clipboard?.writeText(snap.operator.address!)}
            title="Copy"
            className="mt-2 font-mono text-[11px] text-[var(--bind-fg-faint)] transition hover:text-[var(--bind-accent-2)]"
          >
            {shortAddr(snap.operator.address)}
          </button>
        )}
      </div>

      {needsYou > 0 && (
        <a
          href="/wallet/caught"
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[12px] transition hover:bg-white/5"
          style={{ borderColor: "var(--bind-warn)", background: "var(--bind-warn-dim)", color: "var(--bind-warn)" }}
        >
          <span className="pulse dot" style={{ background: "var(--bind-warn)" }} />
          {needsYou} thing{needsYou === 1 ? "" : "s"} need you
        </a>
      )}

      {/* agents */}
      <div className="mt-4 space-y-1">
        {snap.agents.map((a) => (
          <a
            key={a.id}
            href={`/wallet/agent/${a.id}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-white/[0.05]"
          >
            <span
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[13px] font-semibold"
              style={{ background: a.accent, color: "var(--bind-black)" }}
            >
              {a.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[13px] font-medium text-[var(--bind-fg)]">{a.name}</span>
                {a.status !== "active" && (
                  <span className="text-[9px] uppercase" style={{ color: "var(--bind-danger)" }}>
                    {a.status}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="truncate text-[11px] text-[var(--bind-fg-faint)]">{a.role}</span>
                <TrustBars trust={a.trust} />
              </div>
            </div>
            <span className="flex-none text-[13px] text-[var(--bind-fg)]">
              {fmtSui(
                a.subAccounts.reduce((n, s) => n + BigInt(s.balanceMist), BigInt(a.addressBalanceMist)),
                3
              )}
            </span>
          </a>
        ))}
      </div>

      {/* connected sites */}
      {connections.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 px-1 text-[10px] uppercase tracking-wider text-[var(--bind-fg-faint)]">
            Connected
          </div>
          <div className="card divide-y divide-[var(--bind-line)]">
            {connections.slice(0, 4).map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="truncate text-[12px] text-[var(--bind-fg-dim)]">{c.origin}</span>
                <span className="flex-none text-[10px] text-[var(--bind-fg-faint)]">
                  {c.maxActions - c.actionsUsed} left
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        <Open href="/wallet" label="Open full wallet" primary />
        <button
          onClick={load}
          className="w-full rounded-full border py-2 text-[12px] text-[var(--bind-fg-dim)] transition hover:bg-white/5"
          style={{ borderColor: "var(--bind-line-strong)" }}
        >
          Refresh
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-[520px] w-full overflow-hidden bg-[var(--bind-black)] px-4 pb-4 pt-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-60">
        <MeshGradient columns={4} />
      </div>
      <div className="relative z-10">
        <div className="mb-4 px-1">
          <SwishLogo size={24} />
        </div>
        {children}
      </div>
    </main>
  );
}

function Open({ href, label, primary }: { href: string; label: string; primary?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="block w-full rounded-full py-2.5 text-center text-[12px] font-semibold transition"
      style={
        primary
          ? { background: "var(--bind-mist)", color: "var(--bind-black)" }
          : { border: "1px solid var(--bind-line-strong)", color: "var(--bind-fg)" }
      }
    >
      {label}
    </a>
  );
}
