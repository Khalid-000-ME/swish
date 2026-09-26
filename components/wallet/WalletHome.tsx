"use client";

import { useState } from "react";
import Link from "next/link";
import type { WalletSnapshot } from "./types";
import { fmtSui, timeAgo } from "./types";
import { OutcomePill, TrustBars, EmptyState } from "./bits";
import { ExplorerLink } from "./ExplorerLink";

type Tab = "agents" | "activity" | "caught" | "approvals";

export function WalletHome({ snap }: { snap: WalletSnapshot }) {
  const [tab, setTab] = useState<Tab>("agents");

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "agents", label: "Agents", count: snap.agents.length },
    { id: "activity", label: "Activity" },
    { id: "caught", label: "Caught", count: snap.caught.length },
    { id: "approvals", label: "Needs you", count: snap.approvals.length },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-20">
      {/* ------------------------- balance header ------------------------- */}
      <header className="pt-10 text-center">
        <div className="font-num text-[56px] leading-none text-[var(--bind-mist)]">
          {fmtSui(snap.holdings.total, 4)}
          <span className="ml-2 text-2xl text-[var(--bind-fg-dim)]">SUI</span>
        </div>
        <div className="mt-2 text-sm text-[var(--bind-fg-dim)]">
          <span className="font-num">{fmtSui(snap.holdings.vault, 4)}</span> in vaults
          <span className="mx-2 text-[var(--bind-fg-faint)]">·</span>
          <span className="font-num">{fmtSui(snap.holdings.agents, 4)}</span> held by agents
        </div>

        <div className="mt-6 grid grid-cols-5 gap-2.5">
          <ActionButton href="/onboarding" label="Hire" glyph="+" />
          <ActionButton href="/wallet/caught" label="Review" glyph="⚑" badge={snap.caught.length} />
          <ActionButton href="/wallet/approvals" label="Approve" glyph="✓" badge={snap.approvals.length} />
          <ActionButton href="/wallet/connections" label="Sites" glyph="⇄" />
          <ActionButton href="/wallet/a2a" label="A2A" glyph="⇉" />
        </div>
      </header>

      {/* ------------------------------ tabs ------------------------------ */}
      <div className="mt-9 flex gap-5 border-b border-[var(--bind-line)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="relative -mb-px pb-3 text-sm transition"
            style={{ color: tab === t.id ? "var(--bind-fg)" : "var(--bind-fg-faint)" }}
          >
            {t.label}
            {t.count ? <span className="ml-1.5 text-[var(--bind-fg-faint)]">{t.count}</span> : null}
            {tab === t.id && (
              <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-[var(--bind-mist)]" />
            )}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "agents" && <AgentList snap={snap} />}
        {tab === "activity" && <ActivityList snap={snap} items={snap.activity} empty="No payments yet." />}
        {tab === "caught" && (
          <ActivityList snap={snap} items={snap.caught} empty="Nothing in quarantine." link="/wallet/caught" />
        )}
        {tab === "approvals" && (
          <ActivityList snap={snap} items={snap.approvals} empty="Nothing waiting on you." link="/wallet/approvals" />
        )}
      </div>
    </div>
  );
}

function ActionButton({
  href,
  label,
  glyph,
  badge,
}: {
  href: string;
  label: string;
  glyph: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="card relative flex flex-col items-center gap-1.5 py-4 transition hover:bg-[var(--bind-surface-2)]"
    >
      <span className="text-lg leading-none text-[var(--bind-fg)]">{glyph}</span>
      <span className="text-[13px] text-[var(--bind-fg)]">{label}</span>
      {badge ? (
        <span
          className="absolute right-3 top-3 rounded-full px-1.5 text-[10px] font-semibold"
          style={{ background: "var(--bind-danger)", color: "var(--bind-black)" }}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

/** The agent roster, laid out the way a wallet lays out tokens. */
function AgentList({ snap }: { snap: WalletSnapshot }) {
  if (snap.agents.length === 0) {
    return (
      <EmptyState
        title="No agents yet"
        line="Hire one and it shows up here with its own address and budget."
      />
    );
  }

  return (
    <div className="space-y-1">
      {snap.agents.map((a) => {
        const envelopes = a.subAccounts.reduce((n, s) => n + BigInt(s.balanceMist), 0n);
        const held = BigInt(a.addressBalanceMist);
        return (
          <Link
            key={a.id}
            href={`/wallet/agent/${a.id}`}
            className="flex items-center gap-3.5 rounded-xl px-2 py-3 transition hover:bg-[var(--bind-surface)]"
          >
            <span
              className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-sm font-semibold"
              style={{ background: a.accent, color: "var(--bind-black)" }}
            >
              {a.name.slice(0, 1).toUpperCase()}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[15px] font-medium text-[var(--bind-fg)]">{a.name}</span>
                {a.status !== "active" && (
                  <span className="text-[10px] uppercase" style={{ color: "var(--bind-danger)" }}>
                    {a.status}
                  </span>
                )}
                {/* An agent with no key looks perfectly healthy otherwise,
                    and then refuses everything a site asks for. */}
                {!a.signable && (
                  <span className="text-[10px] uppercase" style={{ color: "var(--bind-danger)" }}>
                    no key
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="truncate text-[12px] text-[var(--bind-fg-faint)]">{a.role}</span>
                <TrustBars trust={a.trust} />
              </div>
            </div>

            <div className="flex-none text-right">
              <div className="font-num text-[15px] text-[var(--bind-fg)]">{fmtSui(envelopes + held, 4)}</div>
              <div className="text-[12px] text-[var(--bind-fg-faint)]">
                {a.subAccounts.length} envelope{a.subAccounts.length === 1 ? "" : "s"}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function ActivityList({
  snap,
  items,
  empty,
  link,
}: {
  snap: WalletSnapshot;
  items: WalletSnapshot["activity"];
  empty: string;
  link?: string;
}) {
  if (items.length === 0) return <EmptyState title={empty} line="It'll show up here when it happens." />;

  return (
    <div className="space-y-1">
      {items.slice(0, 20).map((item) => {
        const agent = snap.agents.find((a) => a.id === item.agentId);
        const row = (
          <div className="flex items-center gap-3.5 rounded-xl px-2 py-3 transition hover:bg-[var(--bind-surface)]">
            <span
              className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-sm font-semibold"
              style={{ background: agent?.accent ?? "var(--bind-surface-2)", color: "var(--bind-black)" }}
            >
              {(agent?.name ?? "?").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] text-[var(--bind-fg)]">{item.task}</div>
              <div className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-[var(--bind-fg-faint)]">
                <ExplorerLink value={item.recipient} kind="address" />
                <span>· {timeAgo(item.ts)}</span>
              </div>
            </div>
            <div className="flex-none text-right">
              <div className="font-num text-[15px] text-[var(--bind-fg)]">{fmtSui(item.amountMist, 4)}</div>
              <div className="mt-1">
                <OutcomePill outcome={item.outcome} />
              </div>
            </div>
          </div>
        );
        return link ? (
          <Link key={item.id} href={link}>
            {row}
          </Link>
        ) : (
          <div key={item.id}>{row}</div>
        );
      })}
    </div>
  );
}
