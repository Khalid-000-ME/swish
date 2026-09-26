"use client";

import type { WalletSnapshot } from "./types";
import { fmtSui, timeAgo } from "./types";
import { EmptyState } from "./bits";
import { ExplorerLink } from "./ExplorerLink";

const VIA_LABEL: Record<string, string> = {
  seeded: "set up with the envelope",
  manual: "added by you",
  promoted_from_review: "promoted from Caught, with a verification",
};

/**
 * Standing permission, per envelope. This is the only place authority
 * accumulates, which is why it's worth looking at on its own: an agent
 * can pay anything on this list without interrupting you, and nothing off
 * it without a face.
 */
export function AllowlistPanel({ snap }: { snap: WalletSnapshot }) {
  const rows = snap.agents.flatMap((a) =>
    a.subAccounts.flatMap((s) => s.allowlist.map((e) => ({ agent: a, sub: s, entry: e })))
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl text-[var(--bind-mist)]">Allow-list</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--bind-fg-dim)]">
          Who each envelope may pay without asking. Scoped per envelope on purpose — clearing a
          counterparty for market data does not clear it for vendor payouts.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState title="No standing permissions" line="Every payment would need your verification right now." />
      ) : (
        <div className="space-y-4">
          {snap.agents.map((agent) =>
            agent.subAccounts
              .filter((s) => s.allowlist.length > 0)
              .map((sub) => (
                <section key={`${agent.id}-${sub.id}`} className="card overflow-hidden">
                  <div className="flex items-center gap-2 border-b border-[var(--bind-line)] px-4 py-3">
                    <span className="dot" style={{ background: sub.accent }} />
                    <span className="text-sm font-medium text-[var(--bind-fg)]">
                      {agent.name} · {sub.label}
                    </span>
                    <span className="ml-auto text-[11px] text-[var(--bind-fg-faint)]">
                      cap {fmtSui(sub.perTxCapMist, 1)} SUI / payment
                    </span>
                  </div>

                  <div className="divide-y divide-[var(--bind-line)]">
                    {sub.allowlist.map((e) => (
                      <div key={e.address} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[var(--bind-fg)]">{e.label}</div>
                          <div className="mt-0.5">
                            <ExplorerLink value={e.address} kind="address" className="font-mono text-[11px] text-[var(--bind-fg-faint)] underline decoration-[var(--bind-line-strong)] underline-offset-2 transition hover:text-[var(--bind-accent-2)]" />
                          </div>
                          <div className="mt-1 text-[11px] text-[var(--bind-fg-faint)]">
                            {VIA_LABEL[e.addedVia] ?? e.addedVia}
                            {e.approvedBy && " · verified human"}
                          </div>
                        </div>
                        <div className="text-right text-[11px] text-[var(--bind-fg-faint)]">
                          <div className="text-sm text-[var(--bind-fg-dim)]">{fmtSui(e.totalPaidMist)} SUI paid</div>
                          <div>{e.lastPaidAt ? `last ${timeAgo(e.lastPaidAt)}` : "never paid"}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))
          )}
        </div>
      )}
    </div>
  );
}
