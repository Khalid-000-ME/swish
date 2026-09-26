const OUTCOME_META: Record<
  string,
  { label: string; color: string; bg: string; line: string }
> = {
  auto_executed: {
    label: "Auto-executed",
    color: "var(--swish-ok)",
    bg: "var(--swish-ok-dim)",
    line: "Clean diff, allow-listed recipient — both objects consumed, funds moved.",
  },
  blocked: {
    label: "Blocked — no proof minted",
    color: "var(--swish-danger)",
    bg: "var(--swish-danger-dim)",
    line: "The dry-run diff found effects the declaration never named. Nothing was signed.",
  },
  hard_blocked: {
    label: "Blocked by Intercepta",
    color: "var(--swish-danger)",
    bg: "var(--swish-danger-dim)",
    line: "The recipient screened as flagged before any signature was considered.",
  },
  awaiting_human: {
    label: "Awaiting a verified human",
    color: "var(--swish-warn)",
    bg: "var(--swish-warn-dim)",
    line: "Recipient isn't on the allow-list — the only door left is a fresh World ID verification.",
  },
  override_executed: {
    label: "Executed via override",
    color: "var(--swish-ok)",
    bg: "var(--swish-ok-dim)",
    line: "A verified human approved this exact declaration; both objects were consumed.",
  },
};

export function OutcomeBanner({ outcome }: { outcome: string }) {
  const meta = OUTCOME_META[outcome] ?? {
    label: outcome,
    color: "var(--swish-fg-dim)",
    bg: "var(--swish-surface)",
    line: "",
  };
  return (
    <div
      className="fade-up flex items-center gap-3 rounded-xl border px-5 py-4"
      style={{ background: meta.bg, borderColor: meta.color }}
    >
      <span className="dot h-2.5 w-2.5" style={{ background: meta.color }} />
      <div>
        <div className="text-sm font-semibold" style={{ color: meta.color }}>
          {meta.label}
        </div>
        <div className="mt-0.5 text-sm text-[var(--swish-fg-dim)]">{meta.line}</div>
      </div>
    </div>
  );
}
