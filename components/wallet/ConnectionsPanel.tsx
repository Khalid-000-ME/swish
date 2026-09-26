"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { WalletSnapshot } from "./types";
import { fmtSui, timeAgo } from "./types";
import { EmptyState } from "./bits";

interface Connection {
  id: string;
  origin: string;
  agentId: string;
  subAccountId: string;
  guardrails: { perTxCapMist?: string };
  createdAt: number;
  expiresAt: number;
  maxActions: number;
  actionsUsed: number;
  revokedAt?: number;
  lastUsedAt?: number;
}

interface PendingRequest {
  id: string;
  origin: string;
  reason?: string;
  requestedAt: number;
}

/** Everything that currently has permission to ask your agents for things. */
export function ConnectionsPanel({ snap }: { snap: WalletSnapshot }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // Expiry is time-relative, and reading the clock during render makes
  // the result unstable across re-renders. Held in state and ticked.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/wallet/connections", { cache: "no-store" });
    const data = await res.json();
    setConnections(data.connections ?? []);
    setPending(data.pending ?? []);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch("/api/wallet/connections", { cache: "no-store" });
      const data = await res.json();
      if (!alive) return;
      setConnections(data.connections ?? []);
      setPending(data.pending ?? []);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function revoke(connectionId: string) {
    setBusy(connectionId);
    try {
      await fetch("/api/wallet/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "revoke", connectionId }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  const live = connections.filter((c) => !c.revokedAt && now < c.expiresAt);
  const dead = connections.filter((c) => c.revokedAt || now >= c.expiresAt);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="h-wallet text-3xl text-[var(--bind-mist)]">Connections</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--bind-fg-dim)]">
          Sites that may ask your agents for payments. None of them hold a key — each request still
          goes through the diff, the screen and the envelope&apos;s allow-list.
        </p>
      </header>

      {pending.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-[var(--bind-fg)]">Waiting for you</h2>
          <div className="space-y-2">
            {pending.map((r) => (
              <Link
                key={r.id}
                href={`/connect?request=${r.id}`}
                className="card flex items-center justify-between p-4 transition hover:bg-white/[0.05]"
                style={{ borderColor: "var(--bind-warn)" }}
              >
                <div>
                  <div className="text-sm font-medium text-[var(--bind-fg)]">{r.origin}</div>
                  <div className="mt-0.5 text-[12px] text-[var(--bind-fg-faint)]">
                    asked {timeAgo(r.requestedAt)} · expires 5 min after asking
                  </div>
                </div>
                <span className="chip text-[11px]" style={{ color: "var(--bind-warn)", borderColor: "var(--bind-warn)" }}>
                  Review
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {live.length === 0 && pending.length === 0 ? (
        <EmptyState
          title="Nothing is connected"
          line="When a site asks to use one of your agents, the request shows up here for you to approve."
        />
      ) : (
        live.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-[var(--bind-fg)]">Active</h2>
            <div className="space-y-2">
              {live.map((c) => {
                const agent = snap.agents.find((a) => a.id === c.agentId);
                const remaining = c.maxActions - c.actionsUsed;
                return (
                  <div key={c.id} className="card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[var(--bind-fg)]">{c.origin}</div>
                        <div className="mt-0.5 text-[12px] text-[var(--bind-fg-faint)]">
                          {agent?.name ?? c.agentId}
                          {c.guardrails.perTxCapMist && ` · up to ${fmtSui(c.guardrails.perTxCapMist)} SUI per payment`}
                        </div>
                        <div className="mt-1 text-[11px] text-[var(--bind-fg-faint)]">
                          {remaining} of {c.maxActions} actions left · expires in{" "}
                          {Math.max(0, Math.round((c.expiresAt - now) / 60000))} min
                          {c.lastUsedAt && ` · last used ${timeAgo(c.lastUsedAt)}`}
                        </div>
                      </div>
                      <button
                        disabled={busy === c.id}
                        onClick={() => revoke(c.id)}
                        className="flex-none rounded-full border px-3 py-1.5 text-[12px] font-medium transition hover:bg-white/5 disabled:opacity-40"
                        style={{ borderColor: "var(--bind-danger)", color: "var(--bind-danger)" }}
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )
      )}

      {dead.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-[var(--bind-fg)]">Ended</h2>
          <div className="card divide-y divide-[var(--bind-line)]">
            {dead.slice(0, 10).map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3.5">
                <span className="text-[13px] text-[var(--bind-fg-dim)]">{c.origin}</span>
                <span className="text-[11px] text-[var(--bind-fg-faint)]">
                  {c.revokedAt ? `revoked ${timeAgo(c.revokedAt)}` : "expired"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
