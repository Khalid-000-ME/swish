"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { KnownHuman, OnboardingStep, WalletSnapshot } from "./types";
import { ExplorerLink } from "./ExplorerLink";
import { WorldVerify } from "./WorldVerify";
import { SignInStep } from "./SignInStep";
import { SwishMark } from "@/components/brand/Logo";

const STEPS: Array<{ id: OnboardingStep; label: string; caption: string }> = [
  { id: "signin", label: "Sign in", caption: "Your Sui address" },
  { id: "verify", label: "Verify", caption: "One human, World ID" },
  { id: "vault", label: "Vault", caption: "Where the money sits" },
  { id: "agent", label: "Hire", caption: "Your first agent" },
];

export function Onboarding({ snap, onChanged }: { snap: WalletSnapshot; onChanged: () => Promise<void> }) {
  const router = useRouter();
  const step = snap.onboarding.step;
  const index = Math.max(0, STEPS.findIndex((s) => s.id === step));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else if (data.ok === false && data.reason) setError(data.reason);
      await onChanged();
      return data;
    } finally {
      setBusy(false);
    }
  }

  if (snap.onboarding.complete && snap.onboarding.credentials) {
    return <Credentials snap={snap} onDone={() => router.push("/wallet")} />;
  }

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-10">
      <div className="mb-8 text-center">
        <SwishMark size={30} className="mx-auto mb-5" />
        <h1 className="h-wallet text-4xl text-[var(--swish-mist)]">Set up your wallet</h1>
        <p className="mt-2 text-sm text-[var(--swish-fg-dim)]">
          Four steps. Nothing can hold money until all four are done.
        </p>
      </div>

      {/* step tabs */}
      <div className="mb-7 flex gap-1.5">
        {STEPS.map((s, i) => {
          const done = i < index;
          const active = i === index;
          return (
            <div key={s.id} className="flex-1">
              <div
                className="h-[3px] rounded-full transition-all"
                style={{
                  background: done ? "var(--swish-ok)" : active ? "var(--swish-accent-2)" : "var(--swish-line-strong)",
                }}
              />
              <div className="mt-2">
                <div
                  className="text-[12px] font-medium"
                  style={{ color: active ? "var(--swish-fg)" : done ? "var(--swish-ok)" : "var(--swish-fg-faint)" }}
                >
                  {done ? "✓ " : ""}
                  {s.label}
                </div>
                <div className="text-[10px] text-[var(--swish-fg-faint)]">{s.caption}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card p-6">
        {step === "signin" && (
          <SignInStep
            busy={busy}
            onGenerate={async () => {
              const data = await post({ step: "signin", generate: true });
              return (data?.generated as { address: string; secretKey: string } | undefined) ?? null;
            }}
            onPasted={(address) => post({ step: "signin", address })}
          />
        )}
        {step === "verify" && (
          <VerifyStep
            busy={busy}
            knownHuman={snap.worldKnownHuman}
            onUseRemembered={() => post({ step: "verify", useRemembered: true })}
            onVerified={(proof) => post({ step: "verify", worldDecision: "approve", proof })}
            onCancelled={() => post({ step: "verify", worldDecision: "deny" })}
          />
        )}
        {step === "vault" && (
          <VaultStep busy={busy} chainLive={snap.chainLive} onNext={() => post({ step: "vault" })} />
        )}
        {step === "agent" && <HireStep busy={busy} onSubmit={(payload) => post({ step: "agent", ...payload })} />}

        {error && (
          <p className="mt-4 text-sm" style={{ color: "var(--swish-danger)" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function VerifyStep({
  busy,
  knownHuman,
  onUseRemembered,
  onVerified,
  onCancelled,
}: {
  busy: boolean;
  knownHuman: KnownHuman | null;
  onUseRemembered: () => void;
  onVerified: (proof: unknown) => void;
  onCancelled: () => void;
}) {
  /**
   * World ID is one-per-human-per-action by design, so a second run
   * through onboarding cannot produce a second proof — it produces
   * `nullifier_replayed`. Sending someone to the widget to fail is not a
   * step. When the server already holds a verification it checked against
   * World, this says so and moves on.
   */
  if (knownHuman) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-[var(--swish-fg)]">You&apos;re already verified</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--swish-fg-dim)]">
          World recognised you on {new Date(knownHuman.verifiedAt).toLocaleDateString()}. A World ID
          verifies once per action by design, so there&apos;s nothing to do again here — that refusal
          to repeat is the guarantee working.
        </p>

        <div
          className="mt-5 rounded-xl border p-4"
          style={{ borderColor: "var(--swish-ok-edge)", background: "var(--swish-ok-dim)" }}
        >
          <div className="flex items-center gap-2">
            <span className="dot" style={{ background: "var(--swish-ok)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--swish-ok)" }}>
              {knownHuman.mode === "live" ? "Verified with World ID" : "Verified in sandbox"}
            </span>
          </div>
          <div className="mt-2 text-[11px] uppercase tracking-wider text-[var(--swish-fg-faint)]">
            Nullifier
          </div>
          <div className="mt-1 break-all font-mono text-[11px] text-[var(--swish-fg-dim)]">
            {knownHuman.nullifierHash}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-[var(--swish-fg-faint)]">
            A per-action pseudonym, not an identity. It says &ldquo;the same human as last time&rdquo;
            and nothing else.
          </p>
        </div>

        <button
          disabled={busy}
          onClick={onUseRemembered}
          className="btn btn-primary btn-block btn-lg mt-4"
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-[var(--swish-fg)]">Prove you&apos;re one human</h2>
      <p className="mt-1.5 mb-5 text-sm leading-relaxed text-[var(--swish-fg-dim)]">
        Every agent you hire is bound to this verification. It&apos;s what makes &ldquo;ask the
        human&rdquo; mean a specific person rather than whoever holds a key.
      </p>

      <WorldVerify
        label="Verify with World ID"
        busy={busy}
        onVerified={onVerified}
        onCancelled={onCancelled}
      />
    </div>
  );
}

function VaultStep({ busy, chainLive, onNext }: { busy: boolean; chainLive: boolean; onNext: () => void }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-[var(--swish-fg)]">Your vault</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--swish-fg-dim)]">
        Money lives in a vault you own, not in the agent. The agent gets a spending envelope carved
        out of it — capped, allow-listed, and revocable — and can never reach past that.
      </p>

      <div className="mt-5 rounded-xl border border-[var(--swish-line)] surface-inset p-4">
        <div className="flex items-center gap-2">
          <span className="dot" style={{ background: chainLive ? "var(--swish-ok)" : "var(--swish-warn)" }} />
          <span className="text-sm font-medium text-[var(--swish-fg)]">
            {chainLive ? "Vault contract is live on Sui testnet" : "Running without a published vault"}
          </span>
        </div>
        <p className="mt-1.5 text-[12px] leading-snug text-[var(--swish-fg-faint)]">
          {chainLive
            ? "Your first agent's envelope will be the real on-chain vault object — payments from it settle for real."
            : "Envelopes will be tracked locally and labelled as simulated until a vault is published."}
        </p>
      </div>

      <button
        disabled={busy}
        onClick={onNext}
        className="mt-4 w-full rounded-full py-3 text-sm font-semibold text-[var(--swish-black)] transition disabled:opacity-40"
        style={{ background: "var(--swish-mist)" }}
      >
        Continue
      </button>
    </div>
  );
}

function HireStep({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (p: { name: string; role: string; envelopeLabel: string; startingSui: number; perTxCapSui: number }) => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [envelopeLabel, setEnvelopeLabel] = useState("Working budget");
  const [startingSui, setStartingSui] = useState(0.2);
  const [perTxCapSui, setPerTxCapSui] = useState(0.05);

  return (
    <div>
      <h2 className="text-lg font-semibold text-[var(--swish-fg)]">Hire your first agent</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--swish-fg-dim)]">
        Give it a name, a job, and a small budget. It starts with an empty allow-list — it can&apos;t
        pay anyone until you approve them once.
      </p>

      <div className="mt-5 space-y-3">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Atlas"
            className="w-full rounded-lg border border-[var(--swish-line-strong)] surface-inset px-3 py-2.5 text-sm text-[var(--swish-fg)] outline-none placeholder:text-[var(--swish-fg-faint)] focus:border-[var(--swish-accent-2)]"
          />
        </Field>
        <Field label="What it does">
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Market data & research"
            className="w-full rounded-lg border border-[var(--swish-line-strong)] surface-inset px-3 py-2.5 text-sm text-[var(--swish-fg)] outline-none placeholder:text-[var(--swish-fg-faint)] focus:border-[var(--swish-accent-2)]"
          />
        </Field>
        <Field label="Envelope">
          <input
            value={envelopeLabel}
            onChange={(e) => setEnvelopeLabel(e.target.value)}
            className="w-full rounded-lg border border-[var(--swish-line-strong)] surface-inset px-3 py-2.5 text-sm text-[var(--swish-fg)] outline-none focus:border-[var(--swish-accent-2)]"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Starting budget (SUI)">
            <input
              type="number"
              step="0.01"
              min="0"
              value={startingSui}
              onChange={(e) => setStartingSui(Number(e.target.value))}
              className="w-full rounded-lg border border-[var(--swish-line-strong)] surface-inset px-3 py-2.5 text-sm text-[var(--swish-fg)] outline-none focus:border-[var(--swish-accent-2)]"
            />
          </Field>
          <Field label="Cap per payment (SUI)">
            <input
              type="number"
              step="0.01"
              min="0"
              value={perTxCapSui}
              onChange={(e) => setPerTxCapSui(Number(e.target.value))}
              className="w-full rounded-lg border border-[var(--swish-line-strong)] surface-inset px-3 py-2.5 text-sm text-[var(--swish-fg)] outline-none focus:border-[var(--swish-accent-2)]"
            />
          </Field>
        </div>
      </div>

      <button
        disabled={busy || !name.trim()}
        onClick={() => onSubmit({ name, role, envelopeLabel, startingSui, perTxCapSui })}
        className="btn btn-primary btn-block btn-lg mt-5"
      >
        Hire {name.trim() || "agent"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-[var(--swish-fg-faint)]">{label}</span>
      {children}
    </label>
  );
}

/** Shown once, at the end. Everything here is safe to write down; nothing
 *  here is a secret key — those never leave the server. */
function Credentials({ snap, onDone }: { snap: WalletSnapshot; onDone: () => void }) {
  const c = snap.onboarding.credentials!;
  const rows: Array<[string, string | undefined, "address" | "object"]> = [
    ["Your address", c.operatorAddress, "address"],
    ["Agent address", c.agentAddress, "address"],
    ["Vault object", c.vaultObjectId, "object"],
    ["Package", c.packageId, "object"],
  ];

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-10">
      <div className="mb-7 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--swish-ok-dim)" }}>
          <span className="text-xl" style={{ color: "var(--swish-ok)" }}>
            ✓
          </span>
        </div>
        <h1 className="h-wallet text-4xl text-[var(--swish-mist)]">You&apos;re set up</h1>
        <p className="mt-2 text-sm text-[var(--swish-fg-dim)]">
          Keep these somewhere. They identify your wallet on-chain — they aren&apos;t secrets, and
          signing keys never leave the server.
        </p>
      </div>

      <div className="card divide-y divide-[var(--swish-line)]">
        {rows
          .filter(([, v]) => Boolean(v))
          .map(([label, value, kind]) => (
            <div key={label} className="flex items-center justify-between gap-4 p-4">
              <span className="text-[12px] text-[var(--swish-fg-faint)]">{label}</span>
              <div className="flex items-center gap-3">
                <ExplorerLink value={value!} kind={kind} />
                <button
                  onClick={() => navigator.clipboard?.writeText(value!)}
                  title="Copy"
                  className="text-[11px] text-[var(--swish-fg-faint)] transition hover:text-[var(--swish-fg)]"
                >
                  Copy
                </button>
              </div>
            </div>
          ))}
      </div>

      <button
        onClick={onDone}
        className="btn btn-primary btn-block btn-lg mt-5"
      >
        Open my wallet
      </button>
    </div>
  );
}
