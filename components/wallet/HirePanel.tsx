"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Hiring another agent.
 *
 * The wallet's "Hire" button pointed at /onboarding, which shows the
 * credentials screen once setup has run — so there was no way to add a
 * second agent at all. This is the wizard's last step on its own.
 *
 * It says plainly that only the first agent holds the published vault.
 * Every agent after it gets an envelope this wallet tracks itself, and
 * implying otherwise would be the kind of thing the rest of the product
 * spends its time refusing to do.
 */
export function HirePanel() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [envelopeLabel, setEnvelopeLabel] = useState("Working budget");
  const [perTxCapSui, setPerTxCapSui] = useState(0.05);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);


  async function hire() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet/hire", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, role, envelopeLabel, perTxCapSui }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not hire this agent.");
      router.push(`/wallet/agent/${body.agentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="h-wallet text-3xl text-[var(--swish-mist)]">Hire an agent</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--swish-fg-dim)]">
          Give it a name, a job and a ceiling. It starts with an empty allow-list, so it
          can&apos;t pay anyone until you clear them once.
        </p>
      </header>

      <section className="card p-5">
        <div className="space-y-3.5">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Atlas"
              autoFocus
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

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Envelope">
              <input
                value={envelopeLabel}
                onChange={(e) => setEnvelopeLabel(e.target.value)}
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
                className="font-num w-full rounded-lg border border-[var(--swish-line-strong)] surface-inset px-3 py-2.5 text-sm text-[var(--swish-fg)] outline-none focus:border-[var(--swish-accent-2)]"
              />
            </Field>
          </div>
        </div>

        <button
          disabled={busy || !name.trim() || !(perTxCapSui > 0)}
          onClick={hire}
          className="btn btn-primary btn-block btn-lg mt-5"
        >
          {busy ? "Hiring…" : `Hire ${name.trim() || "agent"}`}
        </button>

        {error && (
          <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: "var(--swish-danger)" }}>
            {error}
          </p>
        )}

        <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--swish-fg-faint)]">
          The envelope is an allocation from your vault, not a second pot — every agent draws on the
          same pool, bounded by what you give it here. It starts with nothing in its own address for
          gas, and you top that up from its page.
        </p>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-[var(--swish-fg-faint)]">
        {label}
      </span>
      {children}
    </label>
  );
}
