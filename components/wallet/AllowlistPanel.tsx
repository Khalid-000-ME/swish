"use client";

import { useState } from "react";
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
export function AllowlistPanel({ snap, onChanged }: { snap: WalletSnapshot; onChanged?: () => void }) {
  const total = snap.agents.reduce(
    (n, a) => n + a.subAccounts.reduce((m, s) => m + s.allowlist.length, 0),
    0
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="h-wallet text-3xl text-[var(--bind-mist)]">Allow-list</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--bind-fg-dim)]">
          Who each envelope may pay without asking. Scoped per envelope on purpose — clearing a
          counterparty for market data does not clear it for vendor payouts.
        </p>
      </header>

      {total === 0 && (
        <EmptyState
          title="No standing permissions"
          line="Every payment needs your verification right now. Clear a counterparty below to change that for one envelope."
        />
      )}

      <div className="space-y-4">
        {snap.agents.map((agent) =>
          agent.subAccounts.map((sub) => (
            <section key={`${agent.id}-${sub.id}`} className="card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-[var(--bind-line)] px-4 py-3">
                <span className="dot" style={{ background: sub.accent }} />
                <span className="text-sm font-medium text-[var(--bind-fg)]">
                  {agent.name} · {sub.label}
                </span>
                <span className="ml-auto text-[11px] text-[var(--bind-fg-faint)]">
                  cap <span className="font-num">{fmtSui(sub.perTxCapMist, 1)} SUI</span> / payment
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
                    <div className="flex flex-none items-center gap-3">
                      <div className="text-right text-[11px] text-[var(--bind-fg-faint)]">
                        <div className="font-num text-sm text-[var(--bind-fg-dim)]">{fmtSui(e.totalPaidMist)} SUI paid</div>
                        <div>{e.lastPaidAt ? `last ${timeAgo(e.lastPaidAt)}` : "never paid"}</div>
                      </div>
                      <RemoveButton
                        agentId={agent.id}
                        subAccountId={sub.id}
                        address={e.address}
                        onDone={onChanged}
                      />
                    </div>
                  </div>
                ))}

                {sub.allowlist.length === 0 && (
                  <p className="px-4 py-3 text-[12px] text-[var(--bind-fg-faint)]">
                    Nothing cleared. Every payment out of this envelope stops for you first.
                  </p>
                )}
              </div>

              <ClearForm agentId={agent.id} subAccountId={sub.id} onChain={sub.onChain} onDone={onChanged} />
            </section>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Clearing a counterparty ahead of time.
 *
 * Without this the only route onto an allow-list was approving a payment
 * that had already been caught, so the first payment to every vendor had
 * to interrupt someone — including vendors the operator already knew they
 * wanted to pay.
 */
function ClearForm({
  agentId,
  subAccountId,
  onChain,
  onDone,
}: {
  agentId: string;
  subAccountId: string;
  onChain: boolean;
  onDone?: () => void;
}) {
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/wallet/allowlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId, subAccountId, address: address.trim(), label: label.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not clear this address.");
      setAddress("");
      setLabel("");
      setNote({
        ok: true,
        text: body.onChainDigest
          ? "Cleared, and written to the vault on chain."
          : "Cleared in this wallet.",
      });
      onDone?.();
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-[var(--bind-line)] bg-black/20 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x… counterparty address"
          spellCheck={false}
          className="min-w-0 flex-[2] rounded-lg border border-[var(--bind-line-strong)] bg-black/30 px-3 py-2 font-mono text-[12px] text-[var(--bind-fg)] outline-none placeholder:text-[var(--bind-fg-faint)] focus:border-[var(--bind-accent-2)]"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Who they are"
          className="min-w-0 flex-1 rounded-lg border border-[var(--bind-line-strong)] bg-black/30 px-3 py-2 text-[12px] text-[var(--bind-fg)] outline-none placeholder:text-[var(--bind-fg-faint)] focus:border-[var(--bind-accent-2)]"
        />
        <button
          disabled={busy || address.trim().length === 0}
          onClick={submit}
          className="rounded-full px-4 py-2 text-[12px] font-semibold text-[var(--bind-black)] transition disabled:opacity-40"
          style={{ background: "var(--bind-mist)" }}
        >
          {busy ? "Clearing…" : "Clear"}
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--bind-fg-faint)]">
        {note ? (
          <span style={{ color: note.ok ? "var(--bind-ok)" : "var(--bind-danger)" }}>{note.text}</span>
        ) : onChain ? (
          "Goes to the vault first — the contract checks its own list, not this one, so they have to agree."
        ) : (
          "This envelope isn't on chain yet, so the list lives in the wallet only."
        )}
      </p>
    </div>
  );
}

function RemoveButton({
  agentId,
  subAccountId,
  address,
  onDone,
}: {
  agentId: string;
  subAccountId: string;
  address: string;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setFailed(null);
    try {
      const res = await fetch("/api/wallet/allowlist", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId, subAccountId, address }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not withdraw this permission.");
      onDone?.();
    } catch (err) {
      setFailed(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-right">
      <button
        disabled={busy}
        onClick={remove}
        title="Withdraw standing permission"
        className="rounded-full border border-[var(--bind-line-strong)] px-3 py-1.5 text-[11px] text-[var(--bind-fg-dim)] transition hover:border-[var(--bind-danger)] hover:text-[var(--bind-danger)] disabled:opacity-40"
      >
        {busy ? "Withdrawing…" : "Withdraw"}
      </button>
      {failed && <div className="mt-1 max-w-40 text-[10px]" style={{ color: "var(--bind-danger)" }}>{failed}</div>}
    </div>
  );
}
