"use client";

import { useState } from "react";
import type { Agent, SubAccount, WalletSnapshot } from "./types";
import { fmtSui, timeAgo } from "./types";
import { OutcomePill, TrustBars, WindowMeter, EmptyState } from "./bits";
import { DiffView } from "./DiffView";
import { GuardrailsEditor } from "./GuardrailsEditor";
import { ExplorerLink } from "./ExplorerLink";
import { FundAgent } from "./FundAgent";
import { AgentBrief } from "./AgentBrief";

export function AgentPanel({
  agent,
  snap,
  onChanged,
}: {
  agent: Agent;
  snap: WalletSnapshot;
  onChanged: () => Promise<void>;
}) {
  const [activeSub, setActiveSub] = useState(agent.subAccounts[0]?.id);
  const [running, setRunning] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sub = agent.subAccounts.find((s) => s.id === activeSub) ?? agent.subAccounts[0];
  const agentActivity = snap.activity.filter((a) => a.agentId === agent.id).slice(0, 12);
  const total = agent.subAccounts.reduce((n, s) => n + BigInt(s.balanceMist), 0n);

  async function runTask(taskId: string) {
    if (!sub) return;
    setRunning(taskId);
    setError(null);
    try {
      const res = await fetch("/api/wallet/task", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: agent.id, subAccountId: sub.id, taskId }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      await onChanged();
    } finally {
      setRunning(null);
    }
  }

  async function setStatus(status: Agent["status"]) {
    await fetch("/api/wallet/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: agent.id, status }),
    });
    await onChanged();
  }

  return (
    <div className="space-y-5">
      {/* header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-[var(--bind-mist)]">{agent.name}</h1>
          <p className="mt-1 text-sm text-[var(--bind-fg-dim)]">{agent.role}</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="chip text-[11px]" style={{ color: "var(--bind-ok)", borderColor: "var(--bind-ok)" }}>
              <span className="dot" style={{ background: "var(--bind-ok)" }} />
              Bound to your World ID
            </span>
            <TrustBars trust={agent.trust} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-[var(--bind-fg-faint)]">Across envelopes</div>
          <div className="font-display text-3xl text-[var(--bind-mist)]">{fmtSui(total.toString())} SUI</div>
          <button
            onClick={() => setStatus(agent.status === "frozen" ? "active" : "frozen")}
            className="mt-2 rounded-full border px-3 py-1.5 text-xs font-medium transition hover:bg-white/5"
            style={{
              borderColor: agent.status === "frozen" ? "var(--bind-ok)" : "var(--bind-danger)",
              color: agent.status === "frozen" ? "var(--bind-ok)" : "var(--bind-danger)",
            }}
          >
            {agent.status === "frozen" ? "Unfreeze agent" : "Freeze agent"}
          </button>
        </div>
      </header>

      <FundAgent agent={agent} onChanged={onChanged} />

      <AgentBrief agent={agent} onChanged={onChanged} />

      {agent.status === "frozen" && (
        <div
          className="rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: "var(--bind-danger)", background: "var(--bind-danger-dim)", color: "var(--bind-danger)" }}
        >
          Frozen. Nothing leaves any of this agent&apos;s envelopes until you unfreeze it — not a pending
          declaration, not an approved one.
        </div>
      )}

      {/* envelopes */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-[var(--bind-fg)]">Envelopes</h2>
          <span className="text-[11px] text-[var(--bind-fg-faint)]">
            Each one is its own vault — a breach of one can&apos;t reach the others
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {agent.subAccounts.map((s) => (
            <EnvelopeCard key={s.id} sub={s} selected={s.id === sub?.id} onSelect={() => setActiveSub(s.id)} />
          ))}
        </div>
      </section>

      {sub && <GuardrailsEditor agentId={agent.id} sub={sub} onSaved={onChanged} />}

      {/* task composer */}
      <section className="card p-5">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-[var(--bind-fg)]">Give {agent.name} a task</h2>
          <span className="text-[11px] text-[var(--bind-fg-faint)]">
            spending from <strong className="text-[var(--bind-fg-dim)]">{sub?.label}</strong>
          </span>
        </div>
        <p className="mb-4 text-[12px] text-[var(--bind-fg-faint)]">
          Ordinary instructions. What differs between them is what the agent runs into while carrying them
          out — stated up front, because hiding it would be the wrong kind of demo.
        </p>

        <div className="grid gap-2.5 sm:grid-cols-2">
          {snap.tasks.map((t) => (
            <button
              key={t.id}
              disabled={running !== null || agent.status === "frozen"}
              onClick={() => runTask(t.id)}
              className="group rounded-xl border border-[var(--bind-line)] p-3.5 text-left transition hover:border-[var(--bind-line-strong)] hover:bg-white/[0.04] disabled:opacity-40"
            >
              <div className="text-sm font-medium text-[var(--bind-fg)]">{t.label}</div>
              <div className="mt-1 text-[12px] leading-snug text-[var(--bind-fg-dim)]">{t.detail}</div>
              <div className="mt-2 text-[11px] italic text-[var(--bind-fg-faint)]">{t.environment}</div>
              {running === t.id && (
                <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--bind-fg-dim)]">
                  <span className="pulse dot" style={{ background: "var(--bind-accent-2)" }} />
                  running the agent…
                </div>
              )}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-3 text-sm" style={{ color: "var(--bind-danger)" }}>
            {error}
          </div>
        )}
      </section>

      {/* activity */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--bind-fg)]">Activity</h2>
        {agentActivity.length === 0 ? (
          <EmptyState
            title="Nothing yet"
            line={`Give ${agent.name} a task above and every declaration it makes shows up here — paid, parked, or caught.`}
          />
        ) : (
          <div className="space-y-2">
            {agentActivity.map((item) => (
              <div key={item.id} className="card overflow-hidden">
                <button
                  onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                  className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-white/[0.03]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-[var(--bind-fg)]">{item.task}</span>
                      <OutcomePill outcome={item.outcome} />
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-[var(--bind-fg-faint)]">
                      <span>{fmtSui(item.amountMist)} SUI →</span>
                      <ExplorerLink value={item.recipient} kind="address" />
                      <span>· {timeAgo(item.ts)}</span>
                    </div>
                  </div>
                  <span className="text-[11px] text-[var(--bind-fg-faint)]">{expanded === item.id ? "Hide" : "Details"}</span>
                </button>

                {expanded === item.id && (
                  <div className="space-y-3 border-t border-[var(--bind-line)] p-4">
                    <DiffView item={item} />
                    <p className="text-sm italic leading-relaxed text-[var(--bind-fg-dim)]">“{item.narration}”</p>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[var(--bind-fg-faint)]">
                      <span>agent: {item.agentMode === "live" ? "live model" : "scripted"}</span>
                      <span>diff: {item.dryRunSource === "chain" ? "live simulateTransaction" : "simulated"}</span>
                      <span>screen: {item.intercepta.source === "live" ? "Intercepta live" : "fixture"}</span>
                      {item.txDigest && (
                        <span className="flex items-center gap-1">
                          tx: <ExplorerLink value={item.txDigest} kind="tx" className="font-mono text-[11px] underline decoration-[var(--bind-line-strong)] underline-offset-2 transition hover:text-[var(--bind-accent-2)]" />
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EnvelopeCard({
  sub,
  selected,
  onSelect,
}: {
  sub: SubAccount;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="card relative overflow-hidden p-4 text-left transition hover:bg-white/[0.05]"
      style={{ borderColor: selected ? sub.accent : undefined }}
    >
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: sub.accent }} />
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-medium text-[var(--bind-fg)]">{sub.label}</div>
          <div className="mt-0.5 max-w-[26ch] text-[11px] leading-snug text-[var(--bind-fg-faint)]">
            {sub.purpose}
          </div>
        </div>
        {sub.onChain && (
          <span className="chip text-[10px]" style={{ color: "var(--bind-ok)", borderColor: "var(--bind-ok)" }}>
            on-chain
          </span>
        )}
      </div>

      <div className="mt-3 font-display text-2xl text-[var(--bind-mist)]">{fmtSui(sub.balanceMist)} SUI</div>

      <div className="mt-3">
        <WindowMeter spent={sub.windowSpentMist} cap={sub.perTxCapMist} accent={sub.accent} />
      </div>

      <div className="mt-3 flex justify-between text-[11px] text-[var(--bind-fg-faint)]">
        <span>cap {fmtSui(sub.perTxCapMist, 1)} SUI / payment</span>
        <span>
          {sub.allowlist.length} address{sub.allowlist.length === 1 ? "" : "es"} allowed
        </span>
      </div>
    </button>
  );
}
