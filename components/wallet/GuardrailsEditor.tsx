"use client";

import { useState } from "react";
import type { CustomLimit, CustomMetric, SubAccount } from "./types";
import { CUSTOM_METRICS, fmtSui } from "./types";

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
  const [custom, setCustom] = useState<CustomLimit[]>(g.custom ?? []);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/wallet/guardrails", {
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
            custom,
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not save.");
      await onSaved();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-[var(--swish-fg)]">Guardrails</h2>
        <span className="text-[11px] text-[var(--swish-fg-faint)]">{sub.label}</span>
      </div>
      <p className="mb-4 text-[12px] leading-snug text-[var(--swish-fg-faint)]">
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
            // A range input has no pseudo-element for "the part left of the
            // thumb", so the filled portion is a gradient whose stop is
            // driven by this. See input[type=range] in globals.css.
            style={{ ["--fill" as string]: `${((maxRiskScore - 10) / 90) * 100}%` }}
            className="w-full"
          />
          <span className="font-num w-10 text-right text-sm text-[var(--swish-fg)]">{maxRiskScore}</span>
        </Field>
      </div>

      <CustomLimits limits={custom} onChange={setCustom} />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          disabled={busy}
          onClick={save}
          className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--swish-black)] transition disabled:opacity-40"
          style={{ background: "var(--swish-mist)" }}
        >
          {busy ? "Saving…" : "Save guardrails"}
        </button>
        {saved && !error && (
          <span className="text-[12px]" style={{ color: "var(--swish-ok)" }}>
            Saved
          </span>
        )}
        {error && (
          <span className="text-[12px]" style={{ color: "var(--swish-danger)" }}>
            {error}
          </span>
        )}
      </div>
    </section>
  );
}

/**
 * Limits the operator names themselves.
 *
 * Each one picks a dimension the engine already measures, so a custom
 * limit is checked by exactly the same code path as the built-in ones.
 * A free-form key/value box would have been easier to build and would
 * have enforced nothing — the point of the title and description is that
 * they become the text of the refusal, so a blocked payment explains
 * itself in the operator's own words.
 */
function CustomLimits({
  limits,
  onChange,
}: {
  limits: CustomLimit[];
  onChange: (next: CustomLimit[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [metric, setMetric] = useState<CustomMetric>("daily");
  const [limit, setLimit] = useState("0.5");

  const spec = CUSTOM_METRICS.find((m) => m.id === metric)!;
  const parsed = Number(limit);
  const valid = title.trim().length > 0 && Number.isFinite(parsed) && parsed >= 0;

  function add() {
    onChange([
      ...limits,
      {
        id: `lim-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        title: title.trim(),
        description: description.trim() || undefined,
        metric,
        limit: parsed,
      },
    ]);
    setTitle("");
    setDescription("");
    setLimit("0.5");
    setAdding(false);
  }

  return (
    <div className="mt-6 border-t border-[var(--swish-line)] pt-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-[var(--swish-fg)]">Your own limits</h3>
        <span className="text-[11px] text-[var(--swish-fg-faint)]">
          {limits.length === 0 ? "none set" : `${limits.length} set`}
        </span>
      </div>
      <p className="mt-1 text-[11.5px] leading-snug text-[var(--swish-fg-faint)]">
        Name a rule in your words. It&apos;s checked by the same engine as everything above, and what
        you write here is what a refusal says.
      </p>

      {limits.length > 0 && (
        <div className="mt-3 space-y-2">
          {limits.map((l) => {
            const m = CUSTOM_METRICS.find((x) => x.id === l.metric);
            return (
              <div
                key={l.id}
                className="flex flex-wrap items-start gap-3 rounded-xl border border-[var(--swish-line)] surface-inset px-3.5 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-[var(--swish-fg)]">{l.title}</div>
                  <div className="mt-0.5 text-[11px] text-[var(--swish-fg-faint)]">
                    {m?.label ?? l.metric} · {l.metric === "risk" ? "at or above" : "over"}{" "}
                    <span className="text-[var(--swish-fg-dim)]">
                      {l.limit}
                      {m?.unit === "/100" ? m.unit : ` ${m?.unit ?? ""}`}
                    </span>
                  </div>
                  {l.description && (
                    <div className="mt-1 text-[11.5px] leading-snug text-[var(--swish-fg-dim)]">
                      {l.description}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => onChange(limits.filter((x) => x.id !== l.id))}
                  className="flex-none text-[11px] text-[var(--swish-fg-faint)] underline underline-offset-2 transition hover:text-[var(--swish-danger)]"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      {adding ? (
        <div className="mt-3 rounded-xl border border-[var(--swish-line-strong)] surface-inset p-3.5">
          <label className="block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-[var(--swish-fg-faint)]">
              Title
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="No big spends before I'm awake"
              className="w-full rounded-lg border border-[var(--swish-line-strong)] surface-inset px-3 py-2 text-sm text-[var(--swish-fg)] outline-none placeholder:text-[var(--swish-fg-faint)] focus:border-[var(--swish-accent-2)]"
            />
          </label>

          <label className="mt-2.5 block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-[var(--swish-fg-faint)]">
              Description
            </span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Why this exists — shown when it stops a payment."
              className="w-full rounded-lg border border-[var(--swish-line-strong)] surface-inset px-3 py-2 text-sm text-[var(--swish-fg)] outline-none placeholder:text-[var(--swish-fg-faint)] focus:border-[var(--swish-accent-2)]"
            />
          </label>

          <div className="mt-2.5 flex flex-wrap items-end gap-2.5">
            <label className="min-w-44 flex-1">
              <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-[var(--swish-fg-faint)]">
                Measure
              </span>
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value as CustomMetric)}
                className="w-full rounded-lg border border-[var(--swish-line-strong)] surface-inset px-3 py-2 text-sm text-[var(--swish-fg)] outline-none focus:border-[var(--swish-accent-2)]"
              >
                {CUSTOM_METRICS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="w-32">
              <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-[var(--swish-fg-faint)]">
                {metric === "risk" ? "At or above" : "No more than"}
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  step={metric === "risk" || metric === "daily_count" ? "1" : "0.01"}
                  min="0"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  className="w-full rounded-lg border border-[var(--swish-line-strong)] surface-inset px-3 py-2 text-sm text-[var(--swish-fg)] outline-none focus:border-[var(--swish-accent-2)]"
                />
                <span className="text-[11px] text-[var(--swish-fg-faint)]">{spec.unit}</span>
              </div>
            </label>
          </div>

          <p className="mt-2 text-[11px] text-[var(--swish-fg-faint)]">{spec.hint}</p>

          <div className="mt-3 flex gap-2">
            <button
              disabled={!valid}
              onClick={add}
              className="rounded-full px-4 py-1.5 text-[12px] font-semibold text-[var(--swish-black)] transition disabled:opacity-40"
              style={{ background: "var(--swish-mist)" }}
            >
              Add limit
            </button>
            <button
              onClick={() => setAdding(false)}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-3 w-full rounded-xl border border-dashed border-[var(--swish-line-strong)] py-2.5 text-[12.5px] text-[var(--swish-fg-dim)] transition hover:border-[var(--swish-accent-2)] hover:text-[var(--swish-fg)]"
        >
          + Add more
        </button>
      )}
    </div>
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
        <span className="text-[13px] text-[var(--swish-fg)]">{label}</span>
        {onChain && (
          <span className="status" style={{ color: "var(--swish-ok)" }}>
            on-chain
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">{children}</div>
      <div className="mt-1 text-[11px] text-[var(--swish-fg-faint)]">{hint}</div>
    </div>
  );
}

function Row({ label, hint, value, onChain }: { label: string; hint: string; value: string; onChain?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[13px] text-[var(--swish-fg)]">{label}</span>
        {onChain && (
          <span className="status" style={{ color: "var(--swish-ok)" }}>
            on-chain
          </span>
        )}
        <span className="ml-auto text-sm text-[var(--swish-fg-dim)]">{value}</span>
      </div>
      <div className="text-[11px] text-[var(--swish-fg-faint)]">{hint}</div>
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
        className="w-full rounded-lg border border-[var(--swish-line-strong)] surface-inset px-3 py-2 text-sm text-[var(--swish-fg)] outline-none placeholder:text-[var(--swish-fg-faint)] focus:border-[var(--swish-accent-2)]"
      />
      <span className="text-[12px] text-[var(--swish-fg-faint)]">SUI</span>
    </div>
  );
}
