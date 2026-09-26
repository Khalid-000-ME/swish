"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OnboardingStep, WalletSnapshot } from "./types";
import { shortAddr } from "./types";

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
        <h1 className="font-display text-4xl text-[var(--bind-mist)]">Set up your wallet</h1>
        <p className="mt-2 text-sm text-[var(--bind-fg-dim)]">
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
                  background: done ? "var(--bind-ok)" : active ? "var(--bind-accent-2)" : "var(--bind-line-strong)",
                }}
              />
              <div className="mt-2">
                <div
                  className="text-[12px] font-medium"
                  style={{ color: active ? "var(--bind-fg)" : done ? "var(--bind-ok)" : "var(--bind-fg-faint)" }}
                >
                  {done ? "✓ " : ""}
                  {s.label}
                </div>
                <div className="text-[10px] text-[var(--bind-fg-faint)]">{s.caption}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card p-6">
        {step === "signin" && <SignInStep busy={busy} onSubmit={(address) => post({ step: "signin", address })} />}
        {step === "verify" && (
          <VerifyStep
            busy={busy}
            sandbox={snap.worldSandbox}
            onVerify={(decision) => post({ step: "verify", worldDecision: decision })}
          />
        )}
        {step === "vault" && (
          <VaultStep busy={busy} chainLive={snap.chainLive} onNext={() => post({ step: "vault" })} />
        )}
        {step === "agent" && <HireStep busy={busy} onSubmit={(payload) => post({ step: "agent", ...payload })} />}

        {error && (
          <p className="mt-4 text-sm" style={{ color: "var(--bind-danger)" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function SignInStep({ busy, onSubmit }: { busy: boolean; onSubmit: (address: string) => void }) {
  const [address, setAddress] = useState("");
  return (
    <div>
      <h2 className="text-lg font-semibold text-[var(--bind-fg)]">Sign in with your Sui address</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--bind-fg-dim)]">
        This address owns every vault below it. Agents get their own addresses, but they never own
        anything — you do.
      </p>

      <input
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="0x…"
        spellCheck={false}
        className="mt-5 w-full rounded-xl border border-[var(--bind-line-strong)] bg-black/30 px-4 py-3 font-mono text-sm text-[var(--bind-fg)] outline-none placeholder:text-[var(--bind-fg-faint)] focus:border-[var(--bind-accent-2)]"
      />

      <button
        disabled={busy || !address.trim()}
        onClick={() => onSubmit(address.trim())}
        className="mt-4 w-full rounded-full py-3 text-sm font-semibold text-[var(--bind-black)] transition disabled:opacity-40"
        style={{ background: "var(--bind-mist)" }}
      >
        Continue
      </button>

      <p className="mt-3 text-[11px] leading-snug text-[var(--bind-fg-faint)]">
        Paste the address you want to operate from — `sui client active-address` prints it. Connecting
        a browser wallet or signing in through zkLogin lands in this same step; this build takes the
        address directly so the flow works without a wallet extension installed.
      </p>
    </div>
  );
}

function VerifyStep({
  busy,
  sandbox,
  onVerify,
}: {
  busy: boolean;
  sandbox: boolean;
  onVerify: (decision: "approve" | "deny") => void;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-[var(--bind-fg)]">Prove you&apos;re one human</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--bind-fg-dim)]">
        Every agent you hire is bound to this verification. It&apos;s what makes &ldquo;ask the human&rdquo;
        mean a specific person rather than whoever holds a key.
        {sandbox && (
          <span className="italic text-[var(--bind-fg-faint)]"> Sandbox mode — fake identity.</span>
        )}
      </p>

      <button
        disabled={busy}
        onClick={() => onVerify("approve")}
        className="mt-5 w-full rounded-full py-3 text-sm font-semibold text-[var(--bind-black)] transition disabled:opacity-40"
        style={{ background: "var(--bind-ok)" }}
      >
        Verify with World ID
      </button>

      <button
        disabled={busy}
        onClick={() => onVerify("deny")}
        className="mt-2 w-full rounded-full py-2.5 text-sm text-[var(--bind-fg-faint)] transition hover:bg-white/5 disabled:opacity-40"
      >
        Cancel verification
      </button>
    </div>
  );
}

function VaultStep({ busy, chainLive, onNext }: { busy: boolean; chainLive: boolean; onNext: () => void }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-[var(--bind-fg)]">Your vault</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--bind-fg-dim)]">
        Money lives in a vault you own, not in the agent. The agent gets a spending envelope carved
        out of it — capped, allow-listed, and revocable — and can never reach past that.
      </p>

      <div className="mt-5 rounded-xl border border-[var(--bind-line)] bg-black/20 p-4">
        <div className="flex items-center gap-2">
          <span className="dot" style={{ background: chainLive ? "var(--bind-ok)" : "var(--bind-warn)" }} />
          <span className="text-sm font-medium text-[var(--bind-fg)]">
            {chainLive ? "Vault contract is live on Sui testnet" : "Running without a published vault"}
          </span>
        </div>
        <p className="mt-1.5 text-[12px] leading-snug text-[var(--bind-fg-faint)]">
          {chainLive
            ? "Your first agent's envelope will be the real on-chain vault object — payments from it settle for real."
            : "Envelopes will be tracked locally and labelled as simulated until a vault is published."}
        </p>
      </div>

      <button
        disabled={busy}
        onClick={onNext}
        className="mt-4 w-full rounded-full py-3 text-sm font-semibold text-[var(--bind-black)] transition disabled:opacity-40"
        style={{ background: "var(--bind-mist)" }}
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
      <h2 className="text-lg font-semibold text-[var(--bind-fg)]">Hire your first agent</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--bind-fg-dim)]">
        Give it a name, a job, and a small budget. It starts with an empty allow-list — it can&apos;t
        pay anyone until you approve them once.
      </p>

      <div className="mt-5 space-y-3">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Atlas"
            className="w-full rounded-lg border border-[var(--bind-line-strong)] bg-black/30 px-3 py-2.5 text-sm text-[var(--bind-fg)] outline-none placeholder:text-[var(--bind-fg-faint)] focus:border-[var(--bind-accent-2)]"
          />
        </Field>
        <Field label="What it does">
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Market data & research"
            className="w-full rounded-lg border border-[var(--bind-line-strong)] bg-black/30 px-3 py-2.5 text-sm text-[var(--bind-fg)] outline-none placeholder:text-[var(--bind-fg-faint)] focus:border-[var(--bind-accent-2)]"
          />
        </Field>
        <Field label="Envelope">
          <input
            value={envelopeLabel}
            onChange={(e) => setEnvelopeLabel(e.target.value)}
            className="w-full rounded-lg border border-[var(--bind-line-strong)] bg-black/30 px-3 py-2.5 text-sm text-[var(--bind-fg)] outline-none focus:border-[var(--bind-accent-2)]"
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
              className="w-full rounded-lg border border-[var(--bind-line-strong)] bg-black/30 px-3 py-2.5 text-sm text-[var(--bind-fg)] outline-none focus:border-[var(--bind-accent-2)]"
            />
          </Field>
          <Field label="Cap per payment (SUI)">
            <input
              type="number"
              step="0.01"
              min="0"
              value={perTxCapSui}
              onChange={(e) => setPerTxCapSui(Number(e.target.value))}
              className="w-full rounded-lg border border-[var(--bind-line-strong)] bg-black/30 px-3 py-2.5 text-sm text-[var(--bind-fg)] outline-none focus:border-[var(--bind-accent-2)]"
            />
          </Field>
        </div>
      </div>

      <button
        disabled={busy || !name.trim()}
        onClick={() => onSubmit({ name, role, envelopeLabel, startingSui, perTxCapSui })}
        className="mt-5 w-full rounded-full py-3 text-sm font-semibold text-[var(--bind-black)] transition disabled:opacity-40"
        style={{ background: "var(--bind-mist)" }}
      >
        Hire {name.trim() || "agent"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-[var(--bind-fg-faint)]">{label}</span>
      {children}
    </label>
  );
}

/** Shown once, at the end. Everything here is safe to write down; nothing
 *  here is a secret key — those never leave the server. */
function Credentials({ snap, onDone }: { snap: WalletSnapshot; onDone: () => void }) {
  const c = snap.onboarding.credentials!;
  const rows: Array<[string, string | undefined]> = [
    ["Your address", c.operatorAddress],
    ["Agent address", c.agentAddress],
    ["Vault object", c.vaultObjectId],
    ["Package", c.packageId],
  ];

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-10">
      <div className="mb-7 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--bind-ok-dim)" }}>
          <span className="text-xl" style={{ color: "var(--bind-ok)" }}>
            ✓
          </span>
        </div>
        <h1 className="font-display text-4xl text-[var(--bind-mist)]">You&apos;re set up</h1>
        <p className="mt-2 text-sm text-[var(--bind-fg-dim)]">
          Keep these somewhere. They identify your wallet on-chain — they aren&apos;t secrets, and
          signing keys never leave the server.
        </p>
      </div>

      <div className="card divide-y divide-[var(--bind-line)]">
        {rows
          .filter(([, v]) => Boolean(v))
          .map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 p-4">
              <span className="text-[12px] text-[var(--bind-fg-faint)]">{label}</span>
              <button
                onClick={() => navigator.clipboard?.writeText(value!)}
                title="Copy"
                className="font-mono text-[12px] text-[var(--bind-fg)] transition hover:text-[var(--bind-accent-2)]"
              >
                {shortAddr(value!)}
              </button>
            </div>
          ))}
      </div>

      <button
        onClick={onDone}
        className="mt-5 w-full rounded-full py-3 text-sm font-semibold text-[var(--bind-black)]"
        style={{ background: "var(--bind-mist)" }}
      >
        Open my wallet
      </button>
    </div>
  );
}
