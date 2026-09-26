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
  onRecognised,
  onCancelled,
  busy,
}: {
  label: string;
  /** Receives the real IDKit proof when live, or null in simulation. */
  onVerified: (proof: IDKitResult | null) => void;
  /**
   * World refused a second proof because it already knows this human.
   * That refusal lands here, inside the widget, so the proof never
   * reaches our verify call — which is why it is a separate outcome from
   * onVerified rather than being folded into it.
   */
  onRecognised?: () => void;
  onCancelled?: () => void;
  busy?: boolean;
}) {
  const [config, setConfig] = useState<WorldConfig | null>(null);
  const [session, setSession] = useState<WorldConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replayed, setReplayed] = useState(false);

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
      if (!signed.configured || !signed.rp_context || !signed.app_id || signed.action === undefined) {
        setError(
          `Could not build a World request${
            signed.missing?.length ? ` — missing ${signed.missing.join(", ")}` : "."
          }`
        );
        return;
      }
      setSession(signed);
      setOpen(true);
    } finally {
      setPreparing(false);
    }
  }

  if (!config) {
    return <div className="text-sm text-[var(--swish-fg-faint)]">Checking World configuration…</div>;
  }

  // --------------------- already known to World ---------------------
  if (replayed) {
    return (
      <div
        className="rounded-xl border p-4"
        style={{ borderColor: "var(--swish-ok-edge)", background: "var(--swish-ok-dim)" }}
      >
        <div className="flex items-center gap-2">
          <span className="dot" style={{ background: "var(--swish-ok)" }} />
          <span className="text-sm font-medium" style={{ color: "var(--swish-ok)" }}>
            World already knows you
          </span>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--swish-fg-dim)]">
          This World ID has already verified for this action, so World won&apos;t issue a second
          proof. That refusal is the uniqueness guarantee working — one human, once — and it&apos;s
          all the personhood this step needs.
        </p>
        <button
          disabled={busy}
          onClick={() => onRecognised?.()}
          className="btn btn-ok btn-block mt-3"
        >
          {busy ? "Continuing…" : "Continue"}
        </button>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--swish-fg-faint)]">
          Recorded as recognition rather than a fresh proof, because the refusal arrives without a
          nullifier. Register a new action in the Developer Portal if you need one.
        </p>
      </div>
    );
  }

  // ------------------------------ live ------------------------------
  if (config.configured) {
    return (
      <div>
        <button
          disabled={busy || preparing}
          onClick={beginVerification}
          className="w-full rounded-full py-3 text-sm font-semibold text-[var(--swish-black)] transition disabled:opacity-40"
          style={{ background: "var(--swish-ok)" }}
        >
          {preparing ? "Preparing…" : label}
        </button>

        {config.environment === "staging" && (
          <p className="mt-2 text-[11px] leading-snug text-[var(--swish-fg-faint)]">
            Staging mode — this QR is for the{" "}
            <a
              href="https://simulator.worldcoin.org"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-[var(--swish-fg-dim)]"
            >
              World simulator
            </a>
            , not the World App on your phone. Scanning it with the real app won&apos;t work — switch
            to production for that.
          </p>
        )}

        {/* action is "" in personhood mode — a truthiness check here is
            what silently swallowed the widget and left the button spinning. */}
        {session?.rp_context && session.app_id && session.action !== undefined && (
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

              // Not a failure. World is refusing to issue a second
              // uniqueness proof because it already knows this human,
              // which is the guarantee working. Treating it as an error
              // left onboarding with no way forward at all.
              if (code === "nullifier_replayed") {
                setReplayed(true);
                return;
              }

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
          <p className="mt-2 text-[12px]" style={{ color: "var(--swish-danger)" }}>
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
        style={{ borderColor: "var(--swish-warn-edge)", background: "var(--swish-warn-dim)", color: "var(--swish-fg-dim)" }}
      >
        <strong style={{ color: "var(--swish-warn)" }}>No World app configured.</strong> This button
        does not verify anybody — it simulates the outcome so the rest of the flow is walkable. Set{" "}
        {(config.missing ?? []).join(", ")} to turn on real World ID.
      </div>

      <button
        disabled={busy}
        onClick={() => onVerified(null)}
        className="btn btn-secondary btn-block btn-lg" style={{ color: "var(--swish-warn)" }}
      >
        Simulate verification
      </button>

      {onCancelled && (
        <button
          disabled={busy}
          onClick={onCancelled}
          className="btn btn-ghost btn-block mt-2"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
