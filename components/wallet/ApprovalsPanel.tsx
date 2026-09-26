"use client";

import { useState } from "react";
import type { ActivityItem, WalletSnapshot } from "./types";
import { fmtSui, shortAddr, timeAgo } from "./types";
import { EmptyState } from "./bits";
import { DiffView } from "./DiffView";
import { ExplorerLink } from "./ExplorerLink";

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
        <h1 className="h-wallet text-3xl text-[var(--swish-mist)]">Needs you</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--swish-fg-dim)]">
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

  async function decide(decision: "approve" | "deny", alsoAllow = false) {
    setBusy(true);
    try {
      await fetch("/api/wallet/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activityId: item.id, decision, alsoAllow }),
      });
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className="card overflow-hidden"
      style={{ borderColor: "color-mix(in srgb, var(--swish-warn) 45%, transparent)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="pulse dot" style={{ background: "var(--swish-warn)" }} />
            <span className="text-sm font-semibold text-[var(--swish-fg)]">
              {agent?.name ?? item.agentId} · {item.task}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[12px] text-[var(--swish-fg-faint)]">
            <span className="font-num">{fmtSui(item.amountMist)} SUI →</span>
            <ExplorerLink value={item.recipient} kind="address" />
            <span>· {timeAgo(item.ts)}</span>
          </div>
        </div>
        <span className="pill" style={{ color: "var(--swish-warn)", background: "var(--swish-warn-dim)" }}>
          new counterparty
        </span>
      </div>

      <p className="px-4 pb-3 text-sm italic text-[var(--swish-fg-dim)]">“{item.narration}”</p>

      <div className="px-4 pb-4">
        <DiffView item={item} />
      </div>

      <div className="space-y-2.5 border-t border-[var(--swish-line)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={busy}
            onClick={() => decide("approve")}
            className="rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-40"
            style={{ background: "var(--swish-ok)", color: "var(--swish-black)" }}
          >
            Verify &amp; pay once
          </button>
          <button
            disabled={busy}
            onClick={() => decide("approve", true)}
            className="rounded-full border px-4 py-2 text-sm font-medium transition hover:bg-[var(--swish-surface-2)] disabled:opacity-40"
            style={{ borderColor: "var(--swish-ok-edge)", color: "var(--swish-ok)" }}
          >
            Pay &amp; always allow
          </button>
          <button
            disabled={busy}
            onClick={() => decide("deny")}
            className="rounded-full border px-4 py-2 text-sm font-medium text-[var(--swish-fg)] transition hover:bg-[var(--swish-surface-2)] disabled:opacity-40"
            style={{ borderColor: "var(--swish-line-strong)" }}
          >
            Decline
          </button>
        </div>
        <p className="text-[11px] leading-snug text-[var(--swish-fg-faint)]">
          <strong className="text-[var(--swish-fg-dim)]">Pay once</strong> settles this payment and
          nothing more — {shortAddr(item.recipient)} will interrupt you again next time.{" "}
          <strong className="text-[var(--swish-fg-dim)]">Always allow</strong> adds it to this
          envelope&apos;s allow-list, so your agent stops asking. That&apos;s standing authority,
          and it&apos;s how an agent earns its way to working unattended.
        </p>
      </div>
    </article>
  );
}
