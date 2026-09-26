import type { ActivityItem } from "./types";
import { fmtSui } from "./types";
import { ExplorerLink } from "./ExplorerLink";

/**
 * "You said X. The chain would actually also do Y." The whole product in
 * two columns — kept deliberately in sentences rather than JSON, because
 * the failure this exists to stop (Bybit) was a human reading a display
 * that didn't match the payload.
 */
export function DiffView({ item }: { item: ActivityItem }) {
  const clean = item.diff.violations.length === 0;

  return (
    <div className="rounded-xl border border-[var(--bind-line)] bg-black/20">
      <div className="grid grid-cols-1 divide-y divide-[var(--bind-line)] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div className="p-4">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--bind-fg-faint)]">
            What the agent declared
          </div>
          <div className="text-sm text-[var(--bind-fg)]">
            Send <strong>{fmtSui(item.amountMist)} SUI</strong>
          </div>
          <div className="mt-0.5 text-sm text-[var(--bind-fg-dim)]">
            to <ExplorerLink value={item.recipient} kind="address" className="font-mono text-[13px] text-[var(--bind-fg-dim)] underline decoration-[var(--bind-line-strong)] underline-offset-2 transition hover:text-[var(--bind-accent-2)]" />
          </div>
          <div className="mt-2 text-sm italic leading-snug text-[var(--bind-fg-faint)]">“{item.reason}”</div>
        </div>

        <div className="p-4">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--bind-fg-faint)]">
            What the chain would actually do
          </div>
          <div className="space-y-1">
            {item.dryRun.balanceChanges
              .filter((b) => b.amount !== "0")
              .map((b, i) => {
                const out = b.amount.startsWith("-");
                const undeclared = !out && b.owner !== item.recipient;
                return (
                  <div
                    key={i}
                    className="text-sm"
                    style={{ color: undeclared ? "var(--bind-danger)" : "var(--bind-fg-dim)" }}
                  >
                    {out ? "−" : "+"}
                    {fmtSui(b.amount.replace("-", ""))} SUI{" "}
                    {out ? (
                      "from this envelope"
                    ) : (
                      <>
                        to <ExplorerLink value={b.owner} kind="address" className="font-mono text-[13px] underline decoration-current/30 underline-offset-2" />
                      </>
                    )}
                    {undeclared && " · never declared"}
                  </div>
                );
              })}
            {item.dryRun.objectChanges.map((o, i) => (
              <div key={i} className="text-sm" style={{ color: "var(--bind-danger)" }}>
                {o.type === "created" ? "creates" : o.type} {o.objectType?.split("::").pop() ?? "object"}
                {o.recipient ? (
                  <>
                    {" → "}
                    <ExplorerLink value={o.recipient} kind="address" className="font-mono text-[13px] underline decoration-current/30 underline-offset-2" />
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      {!clean && (
        <div className="space-y-1.5 border-t border-[var(--bind-line)] p-4">
          {item.diff.violations.map((v, i) => (
            <div key={i} className="flex gap-2 text-sm" style={{ color: "var(--bind-danger)" }}>
              <span className="mt-[3px] dot flex-none" style={{ background: "var(--bind-danger)" }} />
              <span>{v.plain}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
