"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { WalletSnapshot } from "./types";
import { fmtSui } from "./types";

interface PendingRequest {
  id: string;
  origin: string;
  reason?: string;
  requestedAt: number;
  status: string;
}

/**
 * What a site sees when it asks to connect — and the screen this whole
 * product turns on.
 *
 * A wallet connect screen normally asks "which account?". This asks
 * which *agent*, from which envelope, how much per payment, for how
 * long, and for how many actions. The site never receives a key: it
 * receives permission to ask this agent for things, and every request
 * still goes through the diff, the screen and the allow-list.
 */
export function ConnectApproval({
  requestId,
  snap,
  onChanged,
}: {
  requestId: string;
  snap: WalletSnapshot;
  onChanged: () => Promise<void>;
}) {
  const router = useRouter();
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);

  const [agentId, setAgentId] = useState(snap.agents[0]?.id ?? "");
  const agent = snap.agents.find((a) => a.id === agentId);
  const [subAccountId, setSubAccountId] = useState(agent?.subAccounts[0]?.id ?? "");
  const sub = agent?.subAccounts.find((s) => s.id === subAccountId) ?? agent?.subAccounts[0];

  const [perTxCapSui, setPerTxCapSui] = useState(0.02);
  const [ttlMinutes, setTtlMinutes] = useState(60);
  const [maxActions, setMaxActions] = useState(25);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch("/api/wallet/connections", { cache: "no-store" });
      const data = await res.json();
      const found = (data.pending as PendingRequest[]).find((r) => r.id === requestId) ?? null;
      if (alive) {
        setRequest(found);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [requestId]);

  async function decide(action: "approve" | "reject") {
    setBusy(true);
    try {
      await fetch("/api/wallet/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          action === "approve"
            ? { action, requestId, agentId, subAccountId: sub?.id, perTxCapSui, ttlMinutes, maxActions }
            : { action, requestId }
        ),
      });
      await onChanged();
      setDone(action === "approve" ? "approved" : "rejected");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-10 text-center text-sm text-[var(--bind-fg-faint)]">Loading request…</div>;

  if (done) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <h1 className="font-display text-3xl text-[var(--bind-mist)]">
          {done === "approved" ? "Connected" : "Rejected"}
        </h1>
        <p className="mt-2 text-sm text-[var(--bind-fg-dim)]">
          {done === "approved"
            ? "The site can now ask this agent for payments, within the limits you set. You can revoke it any time."
            : "Nothing was granted."}
        </p>
        <button
          onClick={() => router.push("/wallet/connections")}
          className="mt-6 rounded-full px-5 py-2.5 text-sm font-semibold text-[var(--bind-black)]"
          style={{ background: "var(--bind-mist)" }}
        >
          View connections
        </button>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <h1 className="font-display text-2xl text-[var(--bind-mist)]">Request not found</h1>
        <p className="mt-2 text-sm text-[var(--bind-fg-dim)]">
          It may have already been handled, or expired — requests are good for five minutes.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-5 py-10">
      <div className="mb-6 text-center">
        <div className="text-[12px] uppercase tracking-wider text-[var(--bind-fg-faint)]">Connection request</div>
        <h1 className="mt-1 font-display text-3xl text-[var(--bind-mist)]">{request.origin}</h1>
        {request.reason && (
          <p className="mt-2 text-sm italic text-[var(--bind-fg-dim)]">&ldquo;{request.reason}&rdquo;</p>
        )}
        <p className="mt-1 text-[11px] text-[var(--bind-fg-faint)]">
          Said by the site, not verified.
        </p>
      </div>

      <div className="card space-y-4 p-5">
        <div>
          <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-[var(--bind-fg-faint)]">
            Agent
          </label>
          <select
            value={agentId}
            onChange={(e) => {
              setAgentId(e.target.value);
              const next = snap.agents.find((a) => a.id === e.target.value);
              setSubAccountId(next?.subAccounts[0]?.id ?? "");
            }}
            className="w-full rounded-lg border border-[var(--bind-line-strong)] bg-black/30 px-3 py-2.5 text-sm text-[var(--bind-fg)] outline-none focus:border-[var(--bind-accent-2)]"
          >
            {snap.agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {a.role}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-[var(--bind-fg-faint)]">
            Envelope
          </label>
          <select
            value={sub?.id ?? ""}
            onChange={(e) => setSubAccountId(e.target.value)}
            className="w-full rounded-lg border border-[var(--bind-line-strong)] bg-black/30 px-3 py-2.5 text-sm text-[var(--bind-fg)] outline-none focus:border-[var(--bind-accent-2)]"
          >
            {agent?.subAccounts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} — {fmtSui(s.balanceMist)} SUI
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Small label="Per payment" suffix="SUI">
            <input
              type="number" step="0.01" min="0" value={perTxCapSui}
              onChange={(e) => setPerTxCapSui(Number(e.target.value))}
              className="w-full bg-transparent text-sm text-[var(--bind-fg)] outline-none"
            />
          </Small>
          <Small label="Expires in" suffix="min">
            <input
              type="number" min="1" value={ttlMinutes}
              onChange={(e) => setTtlMinutes(Number(e.target.value))}
              className="w-full bg-transparent text-sm text-[var(--bind-fg)] outline-none"
            />
          </Small>
          <Small label="Max actions" suffix="">
            <input
              type="number" min="1" value={maxActions}
              onChange={(e) => setMaxActions(Number(e.target.value))}
              className="w-full bg-transparent text-sm text-[var(--bind-fg)] outline-none"
            />
          </Small>
        </div>

        <p className="text-[11px] leading-snug text-[var(--bind-fg-faint)]">
          {request.origin} gets no key. It can ask {agent?.name ?? "this agent"} to propose payments, and
          each one still goes through the diff, the screen and this envelope&apos;s allow-list. Anything
          it asks for above these limits is refused before signing.
        </p>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          disabled={busy || !agent || !sub}
          onClick={() => decide("approve")}
          className="flex-1 rounded-full py-3 text-sm font-semibold text-[var(--bind-black)] transition disabled:opacity-40"
          style={{ background: "var(--bind-ok)" }}
        >
          Connect
        </button>
        <button
          disabled={busy}
          onClick={() => decide("reject")}
          className="flex-1 rounded-full border py-3 text-sm font-medium text-[var(--bind-fg)] transition hover:bg-white/5 disabled:opacity-40"
          style={{ borderColor: "var(--bind-line-strong)" }}
        >
          Reject
        </button>
      </div>
    </div>
  );
}

function Small({ label, suffix, children }: { label: string; suffix: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--bind-line-strong)] bg-black/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--bind-fg-faint)]">{label}</div>
      <div className="flex items-baseline gap-1">
        {children}
        {suffix && <span className="text-[11px] text-[var(--bind-fg-faint)]">{suffix}</span>}
      </div>
    </div>
  );
}
