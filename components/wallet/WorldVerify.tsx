"use client";

import { useEffect, useState } from "react";
import { IDKitRequestWidget, proofOfHuman } from "@worldcoin/idkit";
import type { IDKitResult, RpContext } from "@worldcoin/idkit";

interface WorldConfig {
  configured: boolean;
  missing?: string[];
  app_id?: `app_${string}`;
  action?: string;
  environment?: "staging" | "production";
  rp_context?: RpContext;
}

/**
 * Real World ID verification when the app is configured; an explicitly
 * labelled simulation when it isn't.
 *
 * The distinction matters more here than in most places: a button that
 * says "Verify with World ID" and silently approves is precisely the
 * gap between a declared intent and an actual effect that the rest of
 * this project exists to catch. So it doesn't say that unless it does it.
 */
export function WorldVerify({
  label,
  onVerified,
  onCancelled,
  busy,
}: {
  label: string;
  /** Receives the real IDKit proof when live, or null in simulation. */
  onVerified: (proof: IDKitResult | null) => void;
  onCancelled?: () => void;
  busy?: boolean;
}) {
  const [config, setConfig] = useState<WorldConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch("/api/world/config", { cache: "no-store" });
      const data = (await res.json()) as WorldConfig;
      if (alive) setConfig(data);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!config) {
    return <div className="text-sm text-[var(--bind-fg-faint)]">Checking World configuration…</div>;
  }

  // ------------------------------ live ------------------------------
  if (config.configured && config.app_id && config.action && config.rp_context) {
    return (
      <div>
        <button
          disabled={busy}
          onClick={() => setOpen(true)}
          className="w-full rounded-full py-3 text-sm font-semibold text-[var(--bind-black)] transition disabled:opacity-40"
          style={{ background: "var(--bind-ok)" }}
        >
          {label}
        </button>

        <IDKitRequestWidget
          open={open}
          onOpenChange={setOpen}
          app_id={config.app_id}
          action={config.action}
          rp_context={config.rp_context}
          allow_legacy_proofs
          environment={config.environment ?? "production"}
          preset={proofOfHuman()}
          onSuccess={(result) => {
            setOpen(false);
            onVerified(result);
          }}
          onError={(code) => {
            setOpen(false);
            setError(`World verification failed: ${code}`);
            onCancelled?.();
          }}
        />

        {error && (
          <p className="mt-2 text-[12px]" style={{ color: "var(--bind-danger)" }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  // --------------------------- not configured ---------------------------
  return (
    <div>
      <div
        className="mb-3 rounded-lg border px-3 py-2.5 text-[12px] leading-snug"
        style={{ borderColor: "var(--bind-warn)", background: "var(--bind-warn-dim)", color: "var(--bind-fg-dim)" }}
      >
        <strong style={{ color: "var(--bind-warn)" }}>No World app configured.</strong> This button
        does not verify anybody — it simulates the outcome so the rest of the flow is walkable. Set{" "}
        {(config.missing ?? []).join(", ")} to turn on real World ID.
      </div>

      <button
        disabled={busy}
        onClick={() => onVerified(null)}
        className="w-full rounded-full border py-3 text-sm font-semibold transition disabled:opacity-40"
        style={{ borderColor: "var(--bind-warn)", color: "var(--bind-warn)" }}
      >
        Simulate verification
      </button>

      {onCancelled && (
        <button
          disabled={busy}
          onClick={onCancelled}
          className="mt-2 w-full rounded-full py-2.5 text-sm text-[var(--bind-fg-faint)] transition hover:bg-white/5 disabled:opacity-40"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
