"use client";

import { useState } from "react";
import type { DisplayResult, OverrideOutcome } from "./types";

export function GatePanel({
  result,
  onOverrideResolved,
}: {
  result: DisplayResult;
  onOverrideResolved: (outcome: OverrideOutcome) => void;
}) {
  const [pending, setPending] = useState(false);
  const { intercepta, interceptaSource, outcome, worldSandbox } = result;

  async function decide(decision: "approve" | "deny") {
    setPending(true);
    try {
      const res = await fetch("/api/override", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ declarationId: result.declaration.id, decision }),
      });
      const outcome: OverrideOutcome = await res.json();
      onOverrideResolved(outcome);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="card p-5">
      <h3 className="mb-4 text-sm font-semibold text-[var(--swish-fg)]">Gates</h3>

      <div className="mb-4 flex items-start gap-3 rounded-lg border border-[var(--swish-line)] p-3">
        <span
          className="mt-1 dot"
          style={{ background: intercepta.flagged ? "var(--swish-danger)" : "var(--swish-ok)" }}
        />
        <div className="text-sm">
          <div className="font-medium text-[var(--swish-fg)]">
            Intercepta — {intercepta.flagged ? "flagged" : "clean"}
            <span className="ml-2 text-xs font-normal text-[var(--swish-fg-faint)]">
              {interceptaSource === "live" ? "live API" : "mock fixture"} · risk {intercepta.riskScore}/100
            </span>
          </div>
          {intercepta.reason && <div className="mt-0.5 text-[var(--swish-fg-dim)]">{intercepta.reason}</div>}
        </div>
      </div>

      {outcome === "awaiting_human" && (
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--swish-warn-edge)", background: "var(--swish-warn-dim)" }}>
          <div className="mb-1 text-sm font-semibold" style={{ color: "var(--swish-warn)" }}>
            World ID for Agents — verification required
          </div>
          <p className="mb-3 text-sm text-[var(--swish-fg-dim)]">
            This recipient isn&apos;t on the allow-list. A fresh, per-declaration human verification is
            the only remaining path.
            {worldSandbox && (
              <span className="ml-1 italic text-[var(--swish-fg-faint)]">
                (Sandbox mode — fake identity, per World&apos;s own track rules.)
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <button
              disabled={pending}
              onClick={() => decide("approve")}
              className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--swish-black)] disabled:opacity-50"
              style={{ background: "var(--swish-ok)" }}
            >
              Verify &amp; approve
            </button>
            <button
              disabled={pending}
              onClick={() => decide("deny")}
              className="rounded-full border px-4 py-2 text-sm font-semibold text-[var(--swish-fg)] disabled:opacity-50"
              style={{ borderColor: "var(--swish-line-strong)" }}
            >
              Cancel verification
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
