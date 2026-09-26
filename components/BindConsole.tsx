"use client";

import { useState } from "react";
import { ScenarioPicker } from "./ScenarioPicker";
import { AgentTranscript } from "./AgentTranscript";
import { DiffPanel } from "./DiffPanel";
import { GatePanel } from "./GatePanel";
import { OutcomeBanner } from "./OutcomeBanner";
import type { DisplayResult, OverrideOutcome } from "./types";
import type { ScenarioId } from "@/lib/types";

export function BindConsole() {
  const [scenario, setScenario] = useState<ScenarioId | null>(null);
  const [result, setResult] = useState<DisplayResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [overrideOutcome, setOverrideOutcome] = useState<OverrideOutcome | null>(null);

  async function run(id: ScenarioId) {
    setScenario(id);
    setLoading(true);
    setResult(null);
    setOverrideOutcome(null);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario: id }),
      });
      const data: DisplayResult = await res.json();
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  const finalOutcome = overrideOutcome
    ? overrideOutcome.status === "override_executed"
      ? "override_executed"
      : overrideOutcome.status === "expired"
        ? "blocked"
        : "blocked"
    : result?.outcome;

  return (
    <div className="mx-auto max-w-5xl px-6 pb-24 pt-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-[var(--bind-mist)]">Bind console</h1>
          <p className="mt-1 text-sm text-[var(--bind-fg-dim)]">
            Pick a scenario — villains first. Every run is a fresh agent invocation against a
            10 SUI demo vault, cap 2 SUI/tx.
          </p>
        </div>
      </div>

      <ScenarioPicker active={scenario} disabled={loading} onPick={run} />

      <div className="mt-8 space-y-5">
        {loading && (
          <div className="card fade-up flex items-center gap-3 p-5 text-sm text-[var(--bind-fg-dim)]">
            <span className="pulse dot" style={{ background: "var(--bind-accent-2)" }} />
            Agent is running its fixed tool sequence…
          </div>
        )}

        {result && !loading && (
          <>
            <OutcomeBanner outcome={finalOutcome ?? result.outcome} />
            <AgentTranscript mode={result.agent.mode} narration={result.agent.narration} steps={result.agent.steps} />
            <DiffPanel result={result} />
            {!overrideOutcome && <GatePanel result={result} onOverrideResolved={setOverrideOutcome} />}

            {overrideOutcome && (
              <div className="card p-5 text-sm">
                <div className="font-semibold text-[var(--bind-fg)]">
                  {overrideOutcome.status === "override_executed" ? "Override approved" : "Override denied"}
                </div>
                <div className="mt-1 text-[var(--bind-fg-dim)]">
                  {overrideOutcome.status === "override_executed"
                    ? "No object minted for a rejected or expired path — this one consumed both a MatchProof-equivalent OverrideApproval and the Declaration."
                    : "No OverrideApproval was ever minted. The declaration will simply expire; nothing moves."}
                </div>
              </div>
            )}

            {(result.proofObjectId || overrideOutcome?.approvalObjectId) && (
              <div className="card flex flex-wrap gap-x-6 gap-y-1 p-5 text-xs text-[var(--bind-fg-faint)]">
                {result.proofObjectId && <span>proof: {result.proofObjectId.slice(0, 18)}…</span>}
                {result.txDigest && <span>tx: {result.txDigest.slice(0, 18)}…</span>}
                {overrideOutcome?.approvalObjectId && <span>approval: {overrideOutcome.approvalObjectId.slice(0, 18)}…</span>}
                {overrideOutcome?.txDigest && <span>tx: {overrideOutcome.txDigest.slice(0, 18)}…</span>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
