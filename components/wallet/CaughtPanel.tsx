"use client";

import { useState } from "react";
import type { ActivityItem, WalletSnapshot } from "./types";
import { fmtSui, shortAddr, timeAgo } from "./types";
import { EmptyState } from "./bits";
import { DiffView } from "./DiffView";
import { ExplorerLink } from "./ExplorerLink";

/**
 * The quarantine inbox. Every declaration a gate stopped lands here
 * instead of vanishing into a log — because a block that nobody ever sees
 * is indistinguishable from a bug, and because the operator is the only
 * one who can decide what a caught address *means*.
 */
export function CaughtPanel({ snap, onChanged }: { snap: WalletSnapshot; onChanged: () => Promise<void> }) {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="h-wallet text-3xl text-[var(--swish-mist)]">Caught</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--swish-fg-dim)]">
          Payments your agents proposed that never happened. Each one names which gate stopped it and what
          it would have actually done — so a block is something you can read, not something you have to
          trust.
        </p>
      </header>

      {snap.caught.length === 0 ? (
        <EmptyState
          title="Nothing in quarantine"
          line="When a gate stops a payment, it lands here with the full diff and three ways out: dismiss it, ban the address, or allow it — which costs a fresh verification."
        />
      ) : (
        <div className="space-y-4">
          {snap.caught.map((item) => (
            <CaughtCard key={item.id} item={item} snap={snap} onChanged={onChanged} />
          ))}
        </div>
      )}

      {snap.bannedAddresses.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-[var(--swish-fg)]">Banned addresses</h2>
          <div className="card divide-y divide-[var(--swish-line)]">
            {snap.bannedAddresses.map((b) => (
              <div key={b.address} className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0">
                  <ExplorerLink value={b.address} kind="address" className="font-mono text-[12px] text-[var(--swish-fg)] underline decoration-[var(--swish-line-strong)] underline-offset-2 transition hover:text-[var(--swish-accent-2)]" />
                  <div className="mt-0.5 text-[12px] text-[var(--swish-fg-faint)]">{b.reason}</div>
                </div>
                <span className="flex-none text-[11px] text-[var(--swish-fg-faint)]">{timeAgo(b.bannedAt)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 px-1 text-[11px] text-[var(--swish-fg-faint)]">
            No agent in this wallet can pay a banned address again, whatever it declares and whatever a
            future screen says.
          </p>
        </section>
      )}
    </div>
  );
}

function CaughtCard({
  item,
  snap,
  onChanged,
}: {
  item: ActivityItem;
  snap: WalletSnapshot;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [label, setLabel] = useState("");

  const agent = snap.agents.find((a) => a.id === item.agentId);
  const caughtBy = item.intercepta.flagged
    ? { who: "Intercepta", line: item.intercepta.reason ?? "Recipient screened as high risk." }
    : {
        who: "The diff",
        line: `The transaction carried ${item.diff.violations.length} effect${
          item.diff.violations.length === 1 ? "" : "s"
        } the agent never declared.`,
      };

  async function review(action: "dismiss" | "ban" | "promote", worldDecision?: "approve" | "deny") {
    setBusy(true);
    try {
      await fetch("/api/wallet/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activityId: item.id, action, label, worldDecision }),
      });
      await onChanged();
    } finally {
      setBusy(false);
      setPromoting(false);
    }
  }

  return (
    <article
      className="card overflow-hidden"
      style={{ borderColor: "color-mix(in srgb, var(--swish-danger) 45%, transparent)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="dot" style={{ background: "var(--swish-danger)" }} />
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
        <div
          className="rounded-lg px-3 py-1.5 text-right"
          style={{ background: "var(--swish-danger-dim)" }}
        >
          <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--swish-danger)" }}>
            Stopped by
          </div>
          <div className="text-sm font-medium" style={{ color: "var(--swish-danger)" }}>
            {caughtBy.who}
          </div>
        </div>
      </div>

      <p className="px-4 pb-3 text-sm text-[var(--swish-fg-dim)]">{caughtBy.line}</p>

      <div className="px-4 pb-4">
        <DiffView item={item} />
      </div>

      {!promoting ? (
        <div className="flex flex-wrap gap-2 border-t border-[var(--swish-line)] p-4">
          <button
            disabled={busy}
            onClick={() => review("ban")}
            className="rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-40"
            style={{ background: "var(--swish-danger)", color: "var(--swish-black)" }}
          >
            Ban this address
          </button>
          <button
            disabled={busy}
            onClick={() => setPromoting(true)}
            className="btn btn-secondary"
          >
            Allow this address…
          </button>
          <button
            disabled={busy}
            onClick={() => review("dismiss")}
            className="rounded-full px-4 py-2 text-sm font-medium text-[var(--swish-fg-dim)] transition hover:bg-[var(--swish-surface-2)] disabled:opacity-40"
          >
            Dismiss
          </button>
        </div>
      ) : (
        <div
          className="space-y-3 border-t p-4"
          style={{ borderColor: "var(--swish-warn-edge)", background: "var(--swish-warn-dim)" }}
        >
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--swish-warn)" }}>
              This one grants standing authority
            </div>
            <p className="mt-1 text-[12px] leading-snug text-[var(--swish-fg-dim)]">
              Dismissing and banning cost nothing — they take authority away. Adding{" "}
              {shortAddr(item.recipient)} to <strong>{item.subAccountId === agent?.subAccounts[0]?.id ? agent?.subAccounts[0]?.label : "this envelope"}</strong>{" "}
              means future payments to it go through without asking you again, so it costs a fresh
              verification.
              {snap.worldSandbox && (
                <span className="italic text-[var(--swish-fg-faint)]"> (Sandbox — fake identity.)</span>
              )}
            </p>
          </div>

          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Name this counterparty (e.g. Helios Data Co.)"
            className="w-full rounded-lg border border-[var(--swish-line-strong)] surface-inset px-3 py-2 text-sm text-[var(--swish-fg)] outline-none placeholder:text-[var(--swish-fg-faint)] focus:border-[var(--swish-accent-2)]"
          />

          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy}
              onClick={() => review("promote", "approve")}
              className="rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-40"
              style={{ background: "var(--swish-ok)", color: "var(--swish-black)" }}
            >
              Verify with World ID &amp; allow
            </button>
            <button
              disabled={busy}
              onClick={() => setPromoting(false)}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
