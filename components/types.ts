// Client-side mirror of lib/types + lib/pipeline shapes, after bigint
// fields have been stringified for transport (see lib/json.ts).

export interface DisplayBalanceChange { owner: string; coinType: string; amount: string }
export interface DisplayObjectChange { type: string; objectType?: string; objectId?: string; recipient?: string }
export interface DisplayViolation { kind: string; detail: string; plain: string }
export interface DisplayStep { tool: string; input: unknown; output: unknown }

export interface DisplayResult {
  id: string;
  ts: number;
  scenario: string;
  declaration: { id: string; recipient: string; maxAmount: string; reason: string; expiresMs: number; coinType: string };
  dryRun: { status: string; error?: string; balanceChanges: DisplayBalanceChange[]; objectChanges: DisplayObjectChange[]; effectsDigest: string };
  diff: { verdict: "clean" | "violations" | "flagged"; violations: DisplayViolation[]; needsHuman: boolean; effectsDigest: string };
  intercepta: { address: string; flagged: boolean; reason?: string; riskScore: number; source: "live" | "mock" };
  agent: { mode: "live" | "scripted"; narration: string; steps: DisplayStep[] };
  outcome: "auto_executed" | "blocked" | "awaiting_human" | "override_executed" | "hard_blocked";
  proofObjectId?: string;
  txDigest?: string;
  dryRunSource: "chain" | "simulated";
  interceptaSource: "live" | "mock";
  worldSandbox: boolean;
  worldAuthorizeUrl: string | null;
}

export interface OverrideOutcome {
  found: boolean;
  status: "override_executed" | "blocked" | "expired";
  approvalObjectId?: string;
  txDigest?: string;
}
