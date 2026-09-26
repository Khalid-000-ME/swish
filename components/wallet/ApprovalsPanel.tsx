"use client";

import { useState } from "react";
import type { ActivityItem, WalletSnapshot } from "./types";
import { fmtSui, shortAddr, timeAgo } from "./types";
import { EmptyState } from "./bits";
import { DiffView } from "./DiffView";

/**
 * Declarations parked because the recipient isn't on the envelope's
 * allow-list. The agent did nothing wrong here — it just proposed paying
 * someone it has no standing permission to pay, and that is the one case
 * where the wallet stops and asks for a face.
 */
export function ApprovalsPanel({ snap, onChanged }: { snap: WalletSnapshot; onChanged: () => Promise<void> }) {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl text-[var(--bind-mist)]">Needs you</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--bind-fg-dim)]">
          Clean diffs to counterparties nobody has approved yet. Declining mints nothing at all — the
          declaration simply expires, which is what makes a refusal structural instead of a flag someone
          can flip back.
        </p>
      </header>

      {snap.approvals.length === 0 ? (
        <EmptyState
          title="Nothing waiting on you"
          line="Routine payments to allow-listed counterparties go through on their own. You only get interrupted when the counterparty is new."
        />
      ) : (
        <div className="space-y-4">
          {snap.approvals.map((item) => (
            <ApprovalCard key={item.id} item={item} snap={snap} onChanged={onChanged} />
          ))}
        </div>
      )}
    </div>
  );
}

function ApprovalCard({
  item,
  snap,
  onChanged,
}: {
  item: ActivityItem;
  snap: WalletSnapshot;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const agent = snap.agents.find((a) => a.id === item.agentId);

  async function decide(decision: "approve" | "deny") {
    setBusy(true);
    try {
      await fetch("/api/wallet/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activityId: item.id, decision }),
      });
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className="card overflow-hidden"
      style={{ borderColor: "color-mix(in srgb, var(--bind-warn) 45%, transparent)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="pulse dot" style={{ background: "var(--bind-warn)" }} />
            <span className="text-sm font-semibold text-[var(--bind-fg)]">
              {agent?.name ?? item.agentId} · {item.task}
            </span>
          </div>
          <div className="mt-1 text-[12px] text-[var(--bind-fg-faint)]">
            {fmtSui(item.amountMist)} SUI → {shortAddr(item.recipient)} · {timeAgo(item.ts)}
          </div>
        </div>
        <span className="chip text-[11px]" style={{ color: "var(--bind-warn)", borderColor: "var(--bind-warn)" }}>
          new counterparty
        </span>
      </div>

      <p className="px-4 pb-3 text-sm italic text-[var(--bind-fg-dim)]">“{item.narration}”</p>

      <div className="px-4 pb-4">
        <DiffView item={item} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--bind-line)] p-4">
        <button
          disabled={busy}
          onClick={() => decide("approve")}
          className="rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-40"
          style={{ background: "var(--bind-ok)", color: "var(--bind-black)" }}
        >
          Verify with World ID &amp; pay once
        </button>
        <button
          disabled={busy}
          onClick={() => decide("deny")}
          className="rounded-full border px-4 py-2 text-sm font-medium text-[var(--bind-fg)] transition hover:bg-white/5 disabled:opacity-40"
          style={{ borderColor: "var(--bind-line-strong)" }}
        >
          Decline
        </button>
        <span className="text-[11px] text-[var(--bind-fg-faint)]">
          Approving pays this once — it does not add {shortAddr(item.recipient)} to the allow-list.
        </span>
      </div>
    </article>
  );
}
