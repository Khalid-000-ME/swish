"use client";

import { useState } from "react";
import type { Agent, SubAccount } from "./types";
import { fmtSui } from "./types";
import { ExplorerLink } from "./ExplorerLink";

/**
 * Moving money from an envelope into the agent's own address.
 *
 * Worth being exact about what this is, because it looks like the thing
 * the whole project exists to prevent and isn't. An agent spending from
 * the vault needs a Declaration, a clean diff and a proof, and is bounded
 * by the cap, the window and the allow-list. This is the *owner* taking
 * money out of their own budget — `owner_withdraw` on chain, owner-only,
 * and it goes near none of that machinery.
 *
 * Two steps on purpose. The first names the amount, the second is an
 * explicit approval that states plainly what is about to happen and where
 * the money lands. Then the digest is shown as a link, because "trust me,
 * it worked" is not a thing a wallet should say.
 */
type Stage =
  | { kind: "idle" }
  | { kind: "confirming"; amountSui: number }
  | { kind: "sending" }
  | { kind: "done"; digest: string; amountSui: number; fromEnvelope: string }
  | { kind: "failed"; message: string };

export function FundFromVault({ agent, onChanged }: { agent: Agent; onChanged: () => Promise<void> }) {
  const onChain = agent.subAccounts.filter((s) => s.onChain && s.vaultObjectId);
  const [subId, setSubId] = useState(onChain[0]?.id ?? "");
  const [amount, setAmount] = useState("0.1");
  const [stage, setStage] = useState<Stage>({ kind: "idle" });

  const sub: SubAccount | undefined = onChain.find((s) => s.id === subId) ?? onChain[0];

  // Nothing to withdraw from — the operator's own key is the only route,
  // and FundAgent already offers that.
  if (!sub) return null;

  async function send(amountSui: number) {
    if (!sub) return;
    setStage({ kind: "sending" });
    try {
      const res = await fetch("/api/wallet/fund", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: agent.id, subAccountId: sub.id, amountSui, source: "vault" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "The withdrawal failed.");
      setStage({
        kind: "done",
        digest: body.digest as string,
        amountSui,
        fromEnvelope: (body.fromEnvelope as string) ?? sub.label,
      });
      await onChanged();
    } catch (err) {
      setStage({ kind: "failed", message: err instanceof Error ? err.message : String(err) });
    }
  }

  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= Number(sub.balanceMist) / 1e9;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--bind-line)] px-4 py-3">
        <div>
          <div className="text-sm font-medium text-[var(--bind-fg)]">Top up from the vault</div>
          <div className="text-[11px] text-[var(--bind-fg-faint)]">
            Your money, out of your own envelope — not an agent payment
          </div>
        </div>
        <span className="ml-auto text-[11px] text-[var(--bind-fg-faint)]">
          <span className="font-num text-[var(--bind-fg-dim)]">{fmtSui(sub.balanceMist, 3)} SUI</span>{" "}
          available
        </span>
      </div>

      <div className="px-4 py-4">
        {stage.kind === "done" ? (
          <div
            className="rounded-xl border px-4 py-3"
            style={{ borderColor: "var(--bind-ok-edge)", background: "var(--bind-ok-dim)" }}
          >
            <div className="text-sm font-medium" style={{ color: "var(--bind-ok)" }}>
              Sent {stage.amountSui} SUI to {agent.name}
            </div>
            <p className="mt-1 text-[12px] text-[var(--bind-fg-dim)]">
              Out of {stage.fromEnvelope}. Check it yourself:
            </p>
            <div className="mt-1.5">
              <ExplorerLink value={stage.digest} kind="tx" />
            </div>
            <button
              onClick={() => setStage({ kind: "idle" })}
              className="mt-3 text-[11px] text-[var(--bind-fg-faint)] underline underline-offset-2 transition hover:text-[var(--bind-fg)]"
            >
              Send another
            </button>
          </div>
        ) : stage.kind === "confirming" ? (
          <div
            className="rounded-xl border px-4 py-3"
            style={{ borderColor: "var(--bind-warn-edge)", background: "var(--bind-warn-dim)" }}
          >
            <div className="text-sm font-medium" style={{ color: "var(--bind-warn)" }}>
              Approve this withdrawal
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--bind-fg-dim)]">
              <strong className="text-[var(--bind-fg)]">{stage.amountSui} SUI</strong> leaves{" "}
              <strong className="text-[var(--bind-fg)]">{sub.label}</strong> and lands at{" "}
              {agent.name}&apos;s own address, where {agent.name} can spend it on gas without asking
              you again.
            </p>
            <div className="mt-1.5">
              <ExplorerLink
                value={agent.address}
                kind="address"
                className="font-mono text-[11px] text-[var(--bind-fg-faint)] underline decoration-[var(--bind-line-strong)] underline-offset-2"
              />
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => send(stage.amountSui)}
                className="rounded-full px-4 py-2 text-[12px] font-semibold text-[var(--bind-black)]"
                style={{ background: "var(--bind-mist)" }}
              >
                Approve and send
              </button>
              <button
                onClick={() => setStage({ kind: "idle" })}
                className="rounded-full border border-[var(--bind-line-strong)] px-4 py-2 text-[12px] text-[var(--bind-fg-dim)] transition hover:text-[var(--bind-fg)]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-2.5">
              {onChain.length > 1 && (
                <label className="flex-1">
                  <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-[var(--bind-fg-faint)]">
                    From
                  </span>
                  <select
                    value={sub.id}
                    onChange={(e) => setSubId(e.target.value)}
                    className="w-full rounded-lg border border-[var(--bind-line-strong)] surface-inset px-3 py-2.5 text-sm text-[var(--bind-fg)] outline-none focus:border-[var(--bind-accent-2)]"
                  >
                    {onChain.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label} — {fmtSui(s.balanceMist, 3)} SUI
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="flex-1">
                <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-[var(--bind-fg-faint)]">
                  Amount
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-lg border border-[var(--bind-line-strong)] surface-inset px-3 py-2.5 text-sm text-[var(--bind-fg)] outline-none focus:border-[var(--bind-accent-2)]"
                  />
                  <span className="text-[12px] text-[var(--bind-fg-faint)]">SUI</span>
                </div>
              </label>

              <button
                disabled={!valid || stage.kind === "sending"}
                onClick={() => setStage({ kind: "confirming", amountSui: parsed })}
                className="rounded-full px-5 py-2.5 text-[12.5px] font-semibold text-[var(--bind-black)] transition disabled:opacity-40"
                style={{ background: "var(--bind-mist)" }}
              >
                {stage.kind === "sending" ? "Sending…" : "Review"}
              </button>
            </div>

            {stage.kind === "failed" && (
              <p className="mt-2.5 text-[11.5px] leading-relaxed" style={{ color: "var(--bind-danger)" }}>
                {stage.message}
              </p>
            )}
            {stage.kind !== "failed" && (
              <p className="mt-2.5 text-[11px] leading-relaxed text-[var(--bind-fg-faint)]">
                Owner-only on chain. This doesn&apos;t touch the per-payment cap, the window or the
                allow-list — those bound {agent.name}, not you.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
