"use client";

import { useState } from "react";
import type { Agent, WalletSnapshot } from "./types";
import { fmtSui } from "./types";
import { ExplorerLink } from "./ExplorerLink";

/**
 * Where the money is, and how to move it.
 *
 * Money sits in three kinds of place and the difference matters, because
 * two of them are real SUI and one isn't:
 *
 *   the vault     a published object holding actual SUI
 *   an address    the operator's, or an agent's — actual SUI
 *   an envelope   a claim on the vault, which is a number, not a pot
 *
 * Reading an envelope as money is the mistake this screen exists to stop:
 * an agent allocated 0.5 SUI can still be unable to pay for gas, because
 * gas comes out of its address. So allocations are shown as allocations,
 * with the chain balances beside them, and raising one is labelled as
 * bookkeeping rather than dressed up as a transfer.
 *
 * Every direction that does touch the chain returns a digest, and the
 * digest is shown as a link. A wallet that says "done" without one is
 * asking to be trusted about the only thing that can be checked.
 */
type Direction =
  | "vault_to_agent"
  | "vault_to_operator"
  | "operator_to_vault"
  | "agent_to_vault"
  | "agent_to_operator";

interface Move {
  id: Direction;
  label: string;
  hint: string;
  /** Whether the form needs an agent picked. */
  needsAgent: boolean;
  /** Whether "send everything" makes sense for this direction. */
  sweepable?: boolean;
}

const MOVES: Move[] = [
  {
    id: "operator_to_vault",
    label: "Your key → vault",
    hint: "Top the pool up. Every envelope draws on it.",
    needsAgent: false,
  },
  {
    id: "vault_to_agent",
    label: "Vault → agent's address",
    hint: "Gas money, out of that agent's allocation.",
    needsAgent: true,
  },
  {
    id: "agent_to_vault",
    label: "Agent's address → vault",
    hint: "Back into the pool. The agent signs it.",
    needsAgent: true,
  },
  {
    id: "agent_to_operator",
    label: "Agent's address → your key",
    hint: "Recover what an agent is holding.",
    needsAgent: true,
    sweepable: true,
  },
  {
    id: "vault_to_operator",
    label: "Vault → your key",
    hint: "Owner-only. Takes your own money back out.",
    needsAgent: false,
  },
];

type Outcome =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "done"; digest?: string; note?: string }
  | { kind: "failed"; message: string };

export function FundsPanel({
  snap,
  onChanged,
}: {
  snap: WalletSnapshot;
  onChanged: () => Promise<void>;
}) {
  const [direction, setDirection] = useState<Direction>("vault_to_agent");
  const [agentId, setAgentId] = useState(snap.agents[0]?.id ?? "");
  const [amount, setAmount] = useState("0.02");
  const [sweep, setSweep] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });

  const move = MOVES.find((m) => m.id === direction)!;
  const agent = snap.agents.find((a) => a.id === agentId) ?? snap.agents[0];
  const parsed = Number(amount);
  const valid = (sweep && move.sweepable) || (Number.isFinite(parsed) && parsed > 0);

  async function run() {
    setOutcome({ kind: "working" });
    try {
      const res = await fetch("/api/wallet/move", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          direction,
          agentId: move.needsAgent ? agent?.id : undefined,
          subAccountId: move.needsAgent ? agent?.subAccounts[0]?.id : undefined,
          amountSui: sweep && move.sweepable ? undefined : parsed,
          all: sweep && move.sweepable,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "That move failed.");
      setOutcome({ kind: "done", digest: body.digest, note: body.note });
      await onChanged();
    } catch (err) {
      setOutcome({ kind: "failed", message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="h-wallet text-3xl text-[var(--swish-mist)]">Funds</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--swish-fg-dim)]">
          Three kinds of place, and only two of them hold real SUI. The vault and every address do;
          an envelope is a claim on the vault, which is a number rather than a pot.
        </p>
      </header>

      <Where snap={snap} />

      <section className="card overflow-hidden">
        <div className="border-b border-[var(--swish-line)] px-4 py-3">
          <div className="text-sm font-medium text-[var(--swish-fg)]">Move money</div>
          <div className="text-[11px] text-[var(--swish-fg-faint)]">{move.hint}</div>
        </div>

        <div className="px-4 py-4">
          <div className="grid gap-1.5 sm:grid-cols-2">
            {MOVES.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setDirection(m.id);
                  setSweep(false);
                  setOutcome({ kind: "idle" });
                }}
                className="rounded-xl px-3 py-2.5 text-left text-[12.5px] transition"
                style={
                  direction === m.id
                    ? { background: "var(--swish-surface-2)", color: "var(--swish-fg)" }
                    : { color: "var(--swish-fg-faint)" }
                }
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-2.5">
            {move.needsAgent && snap.agents.length > 1 && (
              <label className="min-w-40 flex-1">
                <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-[var(--swish-fg-faint)]">
                  Agent
                </span>
                <select
                  value={agent?.id}
                  onChange={(e) => setAgentId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--swish-line-strong)] surface-inset px-3 py-2.5 text-sm text-[var(--swish-fg)] outline-none focus:border-[var(--swish-accent-2)]"
                >
                  {snap.agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="min-w-32 flex-1">
              <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-[var(--swish-fg-faint)]">
                Amount
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={sweep ? "" : amount}
                  disabled={sweep}
                  placeholder={sweep ? "everything" : undefined}
                  onChange={(e) => setAmount(e.target.value)}
                  className="font-num w-full rounded-lg border border-[var(--swish-line-strong)] surface-inset px-3 py-2.5 text-sm text-[var(--swish-fg)] outline-none disabled:opacity-50 focus:border-[var(--swish-accent-2)]"
                />
                <span className="text-[12px] text-[var(--swish-fg-faint)]">SUI</span>
              </div>
            </label>

            <button
              disabled={!valid || outcome.kind === "working"}
              onClick={run}
              className="btn btn-primary"
            >
              {outcome.kind === "working" ? "Moving…" : "Move"}
            </button>
          </div>

          {move.sweepable && (
            <label className="mt-2.5 flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={sweep}
                onChange={(e) => setSweep(e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--swish-accent-2)]"
              />
              <span className="text-[12px] text-[var(--swish-fg-dim)]">
                Everything it holds, less this transaction&apos;s own gas
              </span>
            </label>
          )}

          {outcome.kind === "done" && (
            <div
              className="mt-3 rounded-xl border px-3.5 py-3"
              style={{ borderColor: "var(--swish-ok-edge)", background: "var(--swish-ok-dim)" }}
            >
              <div className="text-[12.5px] font-medium" style={{ color: "var(--swish-ok)" }}>
                Done
              </div>
              {outcome.digest ? (
                <div className="mt-1">
                  <ExplorerLink value={outcome.digest} kind="tx" />
                </div>
              ) : (
                <p className="mt-1 text-[11.5px] text-[var(--swish-fg-dim)]">{outcome.note}</p>
              )}
            </div>
          )}

          {outcome.kind === "failed" && (
            <p className="mt-3 text-[12px] leading-relaxed" style={{ color: "var(--swish-danger)" }}>
              {outcome.message}
            </p>
          )}
        </div>
      </section>

      <Allocations snap={snap} onChanged={onChanged} />
    </div>
  );
}

/** The three places, with what each actually holds. */
function Where({ snap }: { snap: WalletSnapshot }) {
  return (
    <section className="card divide-y divide-[var(--swish-line)]">
      <Row
        label="The vault"
        sub="On chain. What every envelope draws on."
        amount={snap.holdings.vault}
      />
      {snap.ownerAddress && (
        <Row
          label="Your key"
          sub="Owns the vault and pays for owner operations. Money coming back lands here."
          amount={null}
          id={snap.ownerAddress}
        />
      )}
      {snap.operator.address && snap.operator.address !== snap.ownerAddress && (
        <Row
          label="Your sign-in identity"
          sub="The keypair this wallet minted for you. It signs nothing on chain yet."
          amount={null}
          id={snap.operator.address}
        />
      )}
      {snap.agents.map((a) => (
        <Row
          key={a.id}
          label={`${a.name}'s address`}
          sub="Pays that agent's own transaction gas."
          amount={a.addressBalanceMist}
          id={a.address}
          warn={BigInt(a.addressBalanceMist) === 0n}
        />
      ))}
    </section>
  );
}

function Row({
  label,
  sub,
  amount,
  id,
  warn,
}: {
  label: string;
  sub: string;
  amount: string | null;
  id?: string;
  warn?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-[var(--swish-fg)]">{label}</div>
        <div className="text-[11px] text-[var(--swish-fg-faint)]">{sub}</div>
        {id && (
          <div className="mt-0.5">
            <ExplorerLink
              value={id}
              kind="address"
              className="font-mono text-[11px] text-[var(--swish-fg-faint)] underline decoration-[var(--swish-line-strong)] underline-offset-2 transition hover:text-[var(--swish-accent-2)]"
            />
          </div>
        )}
      </div>
      <div className="ml-auto text-right">
        {amount === null ? (
          <span className="text-[11px] text-[var(--swish-fg-faint)]">not tracked here</span>
        ) : (
          <span
            className="font-num text-[15px]"
            style={{ color: warn ? "var(--swish-warn)" : "var(--swish-fg)" }}
          >
            {fmtSui(amount, 4)} SUI
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Envelope allocations, edited in place.
 *
 * This is the part that moves no money. Raising an allocation doesn't
 * create SUI and lowering it doesn't return any — it changes how much of
 * the pool an agent is permitted to draw on, which is why there is no
 * digest to show afterwards.
 */
function Allocations({
  snap,
  onChanged,
}: {
  snap: WalletSnapshot;
  onChanged: () => Promise<void>;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-[var(--swish-line)] px-4 py-3">
        <div className="text-sm font-medium text-[var(--swish-fg)]">Allocations</div>
        <div className="text-[11px] text-[var(--swish-fg-faint)]">
          How much of the vault each envelope may draw on — a limit, not a balance
        </div>
      </div>

      {snap.agents.length === 0 ? (
        <p className="px-4 py-4 text-[12.5px] text-[var(--swish-fg-faint)]">No agents yet.</p>
      ) : (
        <div className="divide-y divide-[var(--swish-line)]">
          {snap.agents.map((agent) =>
            agent.subAccounts.map((sub) => (
              <AllocationRow
                key={`${agent.id}-${sub.id}`}
                agent={agent}
                subId={sub.id}
                label={sub.label}
                allocated={sub.balanceMist}
                onChanged={onChanged}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}

function AllocationRow({
  agent,
  subId,
  label,
  allocated,
  onChanged,
}: {
  agent: Agent;
  subId: string;
  label: string;
  allocated: string;
  onChanged: () => Promise<void>;
}) {
  const asSui = String(Number(allocated) / 1e9);
  const [value, setValue] = useState(asSui);
  const [baseline, setBaseline] = useState(asSui);
  const [busy, setBusy] = useState(false);

  // Adopt a server-side change only when there's nothing being typed,
  // the same rule the brief editor uses.
  const dirty = value !== baseline;
  if (asSui !== baseline && !dirty) {
    setBaseline(asSui);
    setValue(asSui);
  }

  async function save() {
    setBusy(true);
    try {
      await fetch("/api/wallet/move", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          direction: "reallocate",
          agentId: agent.id,
          subAccountId: subId,
          amountSui: Number(value),
        }),
      });
      setBaseline(value);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="h-2 w-2 flex-none rounded-full" style={{ background: agent.accent }} />
      <div className="min-w-0">
        <div className="text-[13px] text-[var(--swish-fg)]">{label}</div>
        <div className="text-[11px] text-[var(--swish-fg-faint)]">{agent.name}</div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <input
          type="number"
          step="0.001"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="font-num w-28 rounded-lg border border-[var(--swish-line-strong)] surface-inset px-3 py-2 text-right text-[13px] text-[var(--swish-fg)] outline-none focus:border-[var(--swish-accent-2)]"
        />
        <span className="text-[11px] text-[var(--swish-fg-faint)]">SUI</span>
        <button
          disabled={!dirty || busy || !(Number(value) >= 0)}
          onClick={save}
          className="btn btn-secondary btn-sm"
        >
          {busy ? "…" : "Set"}
        </button>
      </div>
    </div>
  );
}
