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
 * The rp_context is fetched fresh every time the widget opens, never
 * cached — its nonce is single-use, and reusing one is exactly what
 * World rejects as `duplicate_nonce`. The mount-time request only asks
 * whether World is configured, which burns nothing.
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
  const [session, setSession] = useState<WorldConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
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

  /** One fresh nonce per attempt. */
  async function beginVerification() {
    setPreparing(true);
    setError(null);
    try {
      const res = await fetch("/api/world/config?sign=1", { cache: "no-store" });
      const signed = (await res.json()) as WorldConfig;
      if (!signed.configured || !signed.rp_context) {
        setError("Could not get a signed request from the server.");
        return;
      }
      setSession(signed);
      setOpen(true);
    } finally {
      setPreparing(false);
    }
  }

  if (!config) {
    return <div className="text-sm text-[var(--bind-fg-faint)]">Checking World configuration…</div>;
  }

  // ------------------------------ live ------------------------------
  if (config.configured) {
    return (
      <div>
        <button
          disabled={busy || preparing}
          onClick={beginVerification}
          className="w-full rounded-full py-3 text-sm font-semibold text-[var(--bind-black)] transition disabled:opacity-40"
          style={{ background: "var(--bind-ok)" }}
        >
          {preparing ? "Preparing…" : label}
        </button>

        {config.environment === "staging" && (
          <p className="mt-2 text-[11px] leading-snug text-[var(--bind-fg-faint)]">
            Staging mode — this QR is for the{" "}
            <a
              href="https://simulator.worldcoin.org"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-[var(--bind-fg-dim)]"
            >
              World simulator
            </a>
            , not the World App on your phone. Scanning it with the real app won&apos;t work — switch
            to production for that.
          </p>
        )}

        {session?.rp_context && session.app_id && session.action && (
          <IDKitRequestWidget
            key={session.rp_context.nonce}
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              // Drop the spent request when the modal closes so the next
              // attempt is forced to fetch a new nonce.
              if (!next) setSession(null);
            }}
            app_id={session.app_id}
            action={session.action}
            rp_context={session.rp_context}
            allow_legacy_proofs
            environment={session.environment ?? "production"}
            preset={proofOfHuman()}
            onSuccess={(result) => {
              setOpen(false);
              setSession(null);
              onVerified(result);
            }}
            onError={(code) => {
              setOpen(false);
              setSession(null);
              setError(
                code === "duplicate_nonce"
                  ? "That request was already used. Try again — a fresh one will be issued."
                  : `World verification failed: ${code}`
              );
              onCancelled?.();
            }}
          />
        )}

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
