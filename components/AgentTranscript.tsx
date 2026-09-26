import type { DisplayStep } from "./types";

const TOOL_LABEL: Record<string, string> = {
  readVaultState: "Read vault state",
  purchaseData: "Purchase data (x402)",
  computeAmount: "Compute amount",
  declareIntent: "Declare intent",
  buildTransaction: "Build transaction",
};

function summarize(tool: string, output: unknown): string {
  const o = output as Record<string, unknown>;
  switch (tool) {
    case "readVaultState":
      return `balance ${o.balanceSui} SUI · cap ${o.perTxCapSui} SUI/tx`;
    case "purchaseData":
      return `feed ${o.feedId}${"vendor_note" in o ? " · vendor note attached" : ""}`;
    case "computeAmount":
      return `${o.amountSui} SUI`;
    case "declareIntent":
      return `${o.amountSui} SUI → ${String(o.recipient).slice(0, 10)}…`;
    case "buildTransaction": {
      const undeclared = (o.undeclaredLegs as unknown[] | undefined)?.length ?? 0;
      return undeclared > 0 ? `${undeclared} leg(s) beyond what was declared` : "matches declaration";
    }
    default:
      return "";
  }
}

export function AgentTranscript({ mode, narration, steps }: { mode: string; narration: string; steps: DisplayStep[] }) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--bind-fg)]">Agent</h3>
        <span className="chip bg-white/5 text-[var(--bind-fg-faint)]">
          {mode === "live" ? "claude-sonnet-5" : "scripted — no ANTHROPIC_API_KEY"}
        </span>
      </div>

      <ol className="space-y-2.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3 text-sm">
            <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-white/8 text-[10px] font-semibold text-[var(--bind-fg-dim)]">
              {i + 1}
            </span>
            <div>
              <span className="font-medium text-[var(--bind-fg)]">{TOOL_LABEL[s.tool] ?? s.tool}</span>
              <span className="ml-2 text-[var(--bind-fg-faint)]">{summarize(s.tool, s.output)}</span>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-4 border-t border-[var(--bind-line)] pt-4 text-sm italic leading-relaxed text-[var(--bind-fg-dim)]">
        “{narration}”
      </p>
    </div>
  );
}
