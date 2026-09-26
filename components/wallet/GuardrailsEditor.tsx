"use client";

import { useState } from "react";
import type { SubAccount } from "./types";
import { fmtSui } from "./types";

const SUI = 1e9;
const toSui = (mist?: string) => (mist ? Number(mist) / SUI : null);

/**
 * The parameters that bound an agent.
 *
 * Two of these are enforced by the vault contract itself and the rest
 * are enforced by this server before it signs. The UI says which is
 * which, because they fail differently: a chain-enforced ceiling holds
 * even if this app is compromised, an app-enforced one doesn't.
 */
export function GuardrailsEditor({
  agentId,
  sub,
  onSaved,
}: {
  agentId: string;
  sub: SubAccount;
  onSaved: () => Promise<void>;
}) {
  const g = sub.guardrails ?? {};
  const [windowCap, setWindowCap] = useState(toSui(g.windowCapMist) ?? Number(sub.perTxCapMist) * 5 / SUI);
  const [dailyCap, setDailyCap] = useState<number | "">(toSui(g.dailyCapMist) ?? "");
  const [perCounterparty, setPerCounterparty] = useState<number | "">(toSui(g.perCounterpartyCapMist) ?? "");
  const [approvalThreshold, setApprovalThreshold] = useState<number | "">(toSui(g.approvalThresholdMist) ?? "");
  const [maxRiskScore, setMaxRiskScore] = useState(g.maxRiskScore ?? 70);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      await fetch("/api/wallet/guardrails", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId,
          subAccountId: sub.id,
          guardrails: {
            windowCapSui: windowCap,
            dailyCapSui: dailyCap === "" ? null : dailyCap,
            perCounterpartyCapSui: perCounterparty === "" ? null : perCounterparty,
            approvalThresholdSui: approvalThreshold === "" ? null : approvalThreshold,
            maxRiskScore,
          },
        }),
      });
      await onSaved();
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-[var(--bind-fg)]">Guardrails</h2>
        <span className="text-[11px] text-[var(--bind-fg-faint)]">{sub.label}</span>
      </div>
      <p className="mb-4 text-[12px] leading-snug text-[var(--bind-fg-faint)]">
        What this envelope is allowed to do. Anything breaking these is refused before the agent
        signs — not flagged afterwards.
      </p>

      <div className="space-y-4">
        <Row
          label="Per payment"
          hint="Enforced by the vault contract"
          onChain
          value={`${fmtSui(sub.perTxCapMist)} SUI`}
        />

        <Field
          label="Per window"
          hint={`Total across each ${Math.round(sub.windowMs / 1000)}s window · enforced by the contract`}
          onChain
        >
          <NumberInput value={windowCap} onChange={(v) => setWindowCap(v === "" ? 0 : v)} />
        </Field>

        <Field label="Per day" hint="Total across a calendar day. Blank for no limit.">
          <NumberInput value={dailyCap} onChange={setDailyCap} placeholder="no limit" />
        </Field>

        <Field label="Per counterparty" hint="Total to any one address, all time. Blank for no limit.">
          <NumberInput value={perCounterparty} onChange={setPerCounterparty} placeholder="no limit" />
        </Field>

        <Field label="Always ask above" hint="Stops for your approval even when the counterparty is allow-listed.">
          <NumberInput value={approvalThreshold} onChange={setApprovalThreshold} placeholder="never" />
        </Field>

        <Field label="Refuse risk score at or above" hint="How a counterparty screened, 0–100.">
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={maxRiskScore}
            onChange={(e) => setMaxRiskScore(Number(e.target.value))}
            className="w-full accent-[var(--bind-accent-2)]"
          />
          <span className="w-10 text-right text-sm tabular-nums text-[var(--bind-fg)]">{maxRiskScore}</span>
        </Field>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          disabled={busy}
          onClick={save}
          className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--bind-black)] transition disabled:opacity-40"
          style={{ background: "var(--bind-mist)" }}
        >
          {busy ? "Saving…" : "Save guardrails"}
        </button>
        {saved && (
          <span className="text-[12px]" style={{ color: "var(--bind-ok)" }}>
            Saved
          </span>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  onChain,
  children,
}: {
  label: string;
  hint: string;
  onChain?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[13px] text-[var(--bind-fg)]">{label}</span>
        {onChain && (
          <span className="chip text-[10px]" style={{ color: "var(--bind-ok)", borderColor: "var(--bind-ok)" }}>
            on-chain
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">{children}</div>
      <div className="mt-1 text-[11px] text-[var(--bind-fg-faint)]">{hint}</div>
    </div>
  );
}

function Row({ label, hint, value, onChain }: { label: string; hint: string; value: string; onChain?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[13px] text-[var(--bind-fg)]">{label}</span>
        {onChain && (
          <span className="chip text-[10px]" style={{ color: "var(--bind-ok)", borderColor: "var(--bind-ok)" }}>
            on-chain
          </span>
        )}
        <span className="ml-auto text-sm text-[var(--bind-fg-dim)]">{value}</span>
      </div>
      <div className="text-[11px] text-[var(--bind-fg-faint)]">{hint}</div>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
}: {
  value: number | "";
  onChange: (v: number | "") => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-1 items-center gap-2">
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className="w-full rounded-lg border border-[var(--bind-line-strong)] bg-black/30 px-3 py-2 text-sm text-[var(--bind-fg)] outline-none placeholder:text-[var(--bind-fg-faint)] focus:border-[var(--bind-accent-2)]"
      />
      <span className="text-[12px] text-[var(--bind-fg-faint)]">SUI</span>
    </div>
  );
}
