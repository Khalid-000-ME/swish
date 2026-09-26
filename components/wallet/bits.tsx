import type { AgentTrust } from "./types";

export const OUTCOME_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  auto_executed: { label: "Paid", color: "var(--bind-ok)", bg: "var(--bind-ok-dim)" },
  override_executed: { label: "Paid · you approved", color: "var(--bind-ok)", bg: "var(--bind-ok-dim)" },
  awaiting_human: { label: "Needs you", color: "var(--bind-warn)", bg: "var(--bind-warn-dim)" },
  blocked: { label: "Caught", color: "var(--bind-danger)", bg: "var(--bind-danger-dim)" },
  hard_blocked: { label: "Blocked", color: "var(--bind-danger)", bg: "var(--bind-danger-dim)" },
  denied: { label: "You declined", color: "var(--bind-fg-faint)", bg: "var(--bind-surface)" },
};

export function OutcomePill({ outcome }: { outcome: string }) {
  const s = OUTCOME_STYLE[outcome] ?? { label: outcome, color: "var(--bind-fg-dim)", bg: "var(--bind-surface)" };
  return (
    <span className="pill" style={{ color: s.color, background: s.bg }}>
      <span className="dot" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

/** Rolling record of an agent's recent outcomes — the shape of its behaviour,
 *  not a score anyone has to trust. */
export function TrustBars({ trust }: { trust: AgentTrust }) {
  const slots = [...trust.recent].slice(-14);
  const color = (v: string) =>
    v === "clean" ? "var(--bind-ok)" : v === "human" ? "var(--bind-warn)" : "var(--bind-danger)";
  return (
    <div className="flex items-end gap-[3px]" aria-label="recent outcomes">
      {slots.length === 0 && <span className="text-[11px] text-[var(--bind-fg-faint)]">No history yet</span>}
      {slots.map((v, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full"
          style={{ height: v === "clean" ? 10 : 14, background: color(v), opacity: 0.55 + (i / slots.length) * 0.45 }}
        />
      ))}
    </div>
  );
}

/** How much of this envelope's rolling spend window is consumed. */
export function WindowMeter({ spent, cap, accent }: { spent: string; cap: string; accent: string }) {
  const ceiling = BigInt(cap) * 5n; // window_cap() in allowance_vault.move
  const pct = ceiling === 0n ? 0 : Math.min(100, Number((BigInt(spent) * 100n) / ceiling));
  return (
    <div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/8">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: accent }} />
      </div>
      <div className="mt-1.5 text-[11px] text-[var(--bind-fg-faint)]">
        {pct}% of this window&apos;s ceiling used
      </div>
    </div>
  );
}

export function SourceBadge({ live, liveLabel, simLabel }: { live: boolean; liveLabel: string; simLabel: string }) {
  return (
    <span className="status" style={live ? { color: "var(--bind-fg-dim)" } : undefined}>
      <span className="dot" style={{ background: live ? "var(--bind-ok)" : "var(--bind-fg-faint)" }} />
      {live ? liveLabel : simLabel}
    </span>
  );
}

export function EmptyState({ title, line }: { title: string; line: string }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-1 p-12 text-center">
      <div className="text-sm font-medium text-[var(--bind-fg)]">{title}</div>
      <div className="max-w-sm text-sm text-[var(--bind-fg-faint)]">{line}</div>
    </div>
  );
}
