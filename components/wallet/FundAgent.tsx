"use client";

import { useState } from "react";
import type { Agent } from "./types";
import { fmtSui } from "./types";
import { ExplorerLink } from "./ExplorerLink";

/**
 * An agent pays for its own transactions, so one with an empty address
 * can't do anything — and the failure surfaces late, as a refusal from
 * inside a simulator, when a site is already waiting. This says so up
 * front and offers the two ways out.
 *
 * Also the only place the wallet admits an agent can't sign. That state
 * is unrecoverable rather than temporary, so it's worth being blunt about
 * instead of showing a healthy-looking agent that silently refuses
 * everything.
 */
export function FundAgent({ agent, onChanged }: { agent: Agent; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState<null | "operator" | "faucet">(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const held = BigInt(agent.addressBalanceMist);
  // Enough to cover a demo payment and its gas, roughly.
  const thin = held < 50_000_000n;

  async function fund(source: "operator" | "faucet") {
    setBusy(source);
    setNote(null);
    try {
      const res = await fetch("/api/wallet/fund", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: agent.id, amountSui: 0.2, source }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Funding failed.");
      setNote({
        ok: true,
        text:
          body.via === "faucet"
            ? (body.note as string)
            : `Sent 0.2 SUI from your own key. ${agent.name} now holds ${fmtSui(body.balanceMist, 4)} SUI.`,
      });
      await onChanged();
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  if (!agent.signable) {
    return (
      <div
        className="rounded-xl border px-4 py-3"
        style={{ borderColor: "var(--bind-danger-edge)", background: "var(--bind-danger-dim)" }}
      >
        <div className="text-sm font-medium" style={{ color: "var(--bind-danger)" }}>
          {agent.name} has no signing key
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--bind-fg-dim)]">
          Its address can still receive SUI and be looked up, but nothing can sign on its behalf, so
          every request from a site will be refused. This can&apos;t be repaired — the key is gone.
          Start over from the footer and hire a new agent.
        </p>
        <div className="mt-2">
          <ExplorerLink
            value={agent.address}
            kind="address"
            className="font-mono text-[11px] text-[var(--bind-fg-faint)] underline decoration-[var(--bind-line-strong)] underline-offset-2"
          />
        </div>
      </div>
    );
  }

  if (!thin && !note) return null;

  return (
    <div
      className="rounded-xl border px-4 py-3"
      style={
        thin
          ? { borderColor: "var(--bind-warn-edge)", background: "var(--bind-warn-dim)" }
          : { borderColor: "var(--bind-line-strong)" }
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium" style={{ color: thin ? "var(--bind-warn)" : "var(--bind-fg)" }}>
            {thin ? `${agent.name} can't pay for gas yet` : `${agent.name} holds ${fmtSui(held, 4)} SUI`}
          </div>
          <p className="mt-1 max-w-md text-[12px] leading-relaxed text-[var(--bind-fg-dim)]">
            An agent pays for its own transactions out of its own address, separately from what its
            envelopes hold. It has {fmtSui(held, 4)} SUI there.
          </p>
          <div className="mt-1.5">
            <ExplorerLink
              value={agent.address}
              kind="address"
              className="font-mono text-[11px] text-[var(--bind-fg-faint)] underline decoration-[var(--bind-line-strong)] underline-offset-2 transition hover:text-[var(--bind-accent-2)]"
            />
          </div>
        </div>

        <div className="flex flex-none flex-col gap-1.5">
          <button
            disabled={busy !== null}
            onClick={() => fund("operator")}
            className="rounded-full px-4 py-2 text-[12px] font-semibold text-[var(--bind-black)] transition disabled:opacity-40"
            style={{ background: "var(--bind-mist)" }}
          >
            {busy === "operator" ? "Sending…" : "Send 0.2 SUI"}
          </button>
          <button
            disabled={busy !== null}
            onClick={() => fund("faucet")}
            className="rounded-full border border-[var(--bind-line-strong)] px-4 py-1.5 text-[11px] text-[var(--bind-fg-dim)] transition hover:text-[var(--bind-fg)] disabled:opacity-40"
          >
            {busy === "faucet" ? "Asking…" : "Ask the faucet"}
          </button>
        </div>
      </div>

      {note && (
        <p
          className="mt-2 text-[11px] leading-relaxed"
          style={{ color: note.ok ? "var(--bind-ok)" : "var(--bind-danger)" }}
        >
          {note.text}
        </p>
      )}
      {!note && (
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--bind-fg-faint)]">
          &ldquo;Send&rdquo; comes from your own key — the one that published the vault. The faucet is
          the fallback, and it rate-limits per address and per IP.
        </p>
      )}
    </div>
  );
}
