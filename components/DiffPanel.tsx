import type { DisplayResult } from "./types";

function short(addr: string) {
  return addr.length > 14 ? `${addr.slice(0, 8)}…${addr.slice(-4)}` : addr;
}

function fmtAmount(mist: string) {
  const n = Number(mist) / 1e9;
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 4 })} SUI`;
}

export function DiffPanel({ result }: { result: DisplayResult }) {
  const { declaration, dryRun, diff, dryRunSource } = result;
  const clean = diff.verdict === "clean";

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--bind-fg)]">Declared vs. actual</h3>
        <span className="chip bg-white/5 text-[var(--bind-fg-faint)]">
          {dryRunSource === "chain" ? "live devInspect" : "simulated — no funded gas yet"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--bind-fg-faint)]">
            Declared
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="text-[var(--bind-fg)]">
              Send <strong>{fmtAmount(declaration.maxAmount)}</strong>
            </div>
            <div className="text-[var(--bind-fg-dim)]">to {short(declaration.recipient)}</div>
            <div className="text-[var(--bind-fg-faint)] italic">“{declaration.reason}”</div>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--bind-fg-faint)]">
            The chain would actually do
          </div>
          <div className="space-y-1.5 text-sm">
            {dryRun.balanceChanges
              .filter((b) => b.amount.replace("-", "") !== "0")
              .map((b, i) => {
                const out = b.amount.startsWith("-");
                return (
                  <div key={i} className={out ? "text-[var(--bind-fg-dim)]" : "text-[var(--bind-fg)]"}>
                    {out ? "−" : "+"}
                    {fmtAmount(b.amount.replace("-", ""))} {out ? "from vault" : `to ${short(b.owner)}`}
                  </div>
                );
              })}
            {dryRun.objectChanges.map((o, i) => (
              <div key={i} className="text-[var(--bind-danger)]">
                {o.type === "created" ? "creates" : o.type} {o.objectType?.split("::").pop() ?? "object"}
                {o.recipient ? ` → ${short(o.recipient)}` : ""}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-[var(--bind-line)] pt-4">
        {clean ? (
          <p className="text-sm" style={{ color: "var(--bind-ok)" }}>
            Diff is clean — actual effects are exactly the declared payment.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {diff.violations.map((v, i) => (
              <li key={i} className="text-sm" style={{ color: "var(--bind-danger)" }}>
                <span className="chip mr-2 bg-[var(--bind-danger-dim)] text-[10px]" style={{ color: "var(--bind-danger)" }}>
                  {v.kind}
                </span>
                {v.plain}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
