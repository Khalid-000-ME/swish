"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { WalletSnapshot } from "./types";
import { TrustBars, SourceBadge } from "./bits";
import { AgentPanel } from "./AgentPanel";
import { CaughtPanel } from "./CaughtPanel";
import { ApprovalsPanel } from "./ApprovalsPanel";
import { AllowlistPanel } from "./AllowlistPanel";

type View = { kind: "agent"; agentId: string } | { kind: "caught" } | { kind: "approvals" } | { kind: "allowlist" };

export function WalletApp() {
  const [snap, setSnap] = useState<WalletSnapshot | null>(null);
  const [chosenView, setChosenView] = useState<View | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/wallet", { cache: "no-store" });
    setSnap((await res.json()) as WalletSnapshot);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch("/api/wallet", { cache: "no-store" });
      const data = (await res.json()) as WalletSnapshot;
      if (alive) setSnap(data);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!snap) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-[var(--bind-fg-faint)]">
        Opening wallet…
      </div>
    );
  }

  // Default landing view is derived, not stored — first agent if there is
  // one, so the wallet opens on something rather than an empty queue.
  const view: View = chosenView ?? (snap.agents[0] ? { kind: "agent", agentId: snap.agents[0].id } : { kind: "caught" });
  const setView = setChosenView;
  const activeAgent = view.kind === "agent" ? snap.agents.find((a) => a.id === view.agentId) : undefined;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1180px] gap-6 px-5 py-6">
      {/* ---------------------------- left rail ---------------------------- */}
      <aside className="hidden w-[272px] flex-none flex-col gap-5 lg:flex">
        <Link href="/" className="flex items-center gap-2 px-1 text-sm font-medium text-[var(--bind-fg)]">
          <span className="dot" style={{ background: "var(--bind-accent-2)" }} />
          Bind
        </Link>

        {/* Identity — every agent below hangs off this one verified human. */}
        <div className="card relative overflow-hidden p-4">
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{ background: "radial-gradient(90% 120% at 0% 0%, rgba(36,84,232,0.35), transparent 70%)" }}
          />
          <div className="relative">
            <div className="text-[11px] uppercase tracking-wider text-[var(--bind-fg-faint)]">Operator</div>
            <div className="mt-1 flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-[var(--bind-black)]"
                style={{ background: "var(--bind-mist)" }}
              >
                {snap.operator.handle.slice(0, 1).toUpperCase()}
              </div>
              <div className="text-sm font-medium text-[var(--bind-fg)]">World ID verified</div>
            </div>
            <p className="mt-2 text-[12px] leading-snug text-[var(--bind-fg-dim)]">
              {snap.agents.length} agents are bound to this identity. Each one spends only from its own
              envelopes.
            </p>
          </div>
        </div>

        <div>
          <div className="mb-2 px-1 text-[11px] uppercase tracking-wider text-[var(--bind-fg-faint)]">Agents</div>
          <div className="space-y-1.5">
            {snap.agents.map((a) => {
              const selected = view.kind === "agent" && view.agentId === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => setView({ kind: "agent", agentId: a.id })}
                  className="card w-full p-3 text-left transition hover:bg-white/[0.06]"
                  style={{
                    borderColor: selected ? a.accent : undefined,
                    background: selected ? "var(--bind-surface-2)" : undefined,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium text-[var(--bind-fg)]">
                      <span className="dot" style={{ background: a.accent }} />
                      {a.name}
                    </span>
                    {a.status !== "active" && (
                      <span className="text-[10px] uppercase tracking-wide text-[var(--bind-danger)]">
                        {a.status}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 pl-4 text-[11px] text-[var(--bind-fg-faint)]">{a.role}</div>
                  <div className="mt-2 pl-4">
                    <TrustBars trust={a.trust} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <nav className="space-y-1">
          <RailLink
            label="Caught"
            count={snap.caught.length}
            danger
            active={view.kind === "caught"}
            onClick={() => setView({ kind: "caught" })}
          />
          <RailLink
            label="Needs you"
            count={snap.approvals.length}
            warn
            active={view.kind === "approvals"}
            onClick={() => setView({ kind: "approvals" })}
          />
          <RailLink
            label="Allow-list"
            count={snap.agents.reduce((n, a) => n + a.subAccounts.reduce((m, s) => m + s.allowlist.length, 0), 0)}
            active={view.kind === "allowlist"}
            onClick={() => setView({ kind: "allowlist" })}
          />
        </nav>

        <div className="mt-auto flex flex-wrap gap-1.5 px-1">
          <SourceBadge live={snap.chainLive} liveLabel="Sui testnet · live" simLabel="chain simulated" />
          <SourceBadge live={!snap.worldSandbox} liveLabel="World live" simLabel="World sandbox" />
        </div>
      </aside>

      {/* ------------------------------ main ------------------------------ */}
      <main className="min-w-0 flex-1">
        {/* mobile nav */}
        <div className="mb-4 flex gap-2 overflow-x-auto lg:hidden">
          {snap.agents.map((a) => (
            <button
              key={a.id}
              onClick={() => setView({ kind: "agent", agentId: a.id })}
              className="chip flex-none"
              style={{ borderColor: view.kind === "agent" && view.agentId === a.id ? a.accent : undefined }}
            >
              <span className="dot" style={{ background: a.accent }} />
              {a.name}
            </button>
          ))}
          <button onClick={() => setView({ kind: "caught" })} className="chip flex-none">
            Caught {snap.caught.length > 0 && `· ${snap.caught.length}`}
          </button>
          <button onClick={() => setView({ kind: "approvals" })} className="chip flex-none">
            Needs you {snap.approvals.length > 0 && `· ${snap.approvals.length}`}
          </button>
          <button onClick={() => setView({ kind: "allowlist" })} className="chip flex-none">
            Allow-list
          </button>
        </div>

        {view.kind === "agent" && activeAgent && (
          <AgentPanel agent={activeAgent} snap={snap} onChanged={refresh} />
        )}
        {view.kind === "caught" && <CaughtPanel snap={snap} onChanged={refresh} />}
        {view.kind === "approvals" && <ApprovalsPanel snap={snap} onChanged={refresh} />}
        {view.kind === "allowlist" && <AllowlistPanel snap={snap} />}
      </main>
    </div>
  );
}

function RailLink({
  label,
  count,
  active,
  danger,
  warn,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  danger?: boolean;
  warn?: boolean;
  onClick: () => void;
}) {
  const accent = danger ? "var(--bind-danger)" : warn ? "var(--bind-warn)" : "var(--bind-fg-dim)";
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition hover:bg-white/[0.05]"
      style={{ background: active ? "var(--bind-surface-2)" : undefined }}
    >
      <span className="text-[var(--bind-fg)]">{label}</span>
      {count > 0 && (
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ background: accent, color: "var(--bind-black)" }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
