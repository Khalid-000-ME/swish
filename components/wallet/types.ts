// Client mirror of lib/wallet-store, post-JSON (bigints as strings).

export interface KnownHuman {
  nullifierHash: string;
  verifiedAt: number;
  mode: "live" | "sandbox";
  /** "proof" carries a real nullifier; "replay" is recognition without one. */
  via?: "proof" | "replay";
}

export interface AllowlistEntry {
  address: string;
  label: string;
  addedAt: number;
  addedVia: "seeded" | "manual" | "promoted_from_review";
  approvedBy?: string;
  lastPaidAt?: number;
  totalPaidMist: string;
}

export interface SubAccount {
  id: string;
  label: string;
  purpose: string;
  onChain: boolean;
  vaultObjectId?: string;
  balanceMist: string;
  perTxCapMist: string;
  windowMs: number;
  windowSpentMist: string;
  allowlist: AllowlistEntry[];
  accent: string;
  guardrails?: {
    windowCapMist?: string;
    dailyCapMist?: string;
    perCounterpartyCapMist?: string;
    maxRiskScore?: number;
    approvalThresholdMist?: string;
    allowedCoinTypes?: string[];
    custom?: CustomLimit[];
  };
}

export type CustomMetric =
  | "payment"
  | "window"
  | "daily"
  | "counterparty"
  | "risk"
  | "daily_count";

/** An operator-named limit, measured on a dimension the engine checks. */
export interface CustomLimit {
  id: string;
  title: string;
  description?: string;
  metric: CustomMetric;
  limit: number;
}

export const CUSTOM_METRICS: Array<{ id: CustomMetric; label: string; unit: string; hint: string }> = [
  { id: "payment", label: "Any single payment", unit: "SUI", hint: "Refuse one payment larger than this." },
  { id: "window", label: "Total in the rolling window", unit: "SUI", hint: "Everything settled inside the window." },
  { id: "daily", label: "Total today", unit: "SUI", hint: "Resets at midnight, local time." },
  { id: "counterparty", label: "Total to one counterparty", unit: "SUI", hint: "All time, per address." },
  { id: "risk", label: "Counterparty risk score", unit: "/100", hint: "Refuse at or above this score." },
  { id: "daily_count", label: "Payments today", unit: "payments", hint: "How many, not how much." },
];

export interface AgentTrust {
  declarations: number;
  clean: number;
  caught: number;
  humanApproved: number;
  recent: Array<"clean" | "caught" | "human">;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  address: string;
  addressBalanceMist: string;
  signable: boolean;
  /** Markdown the operator wrote; read by the model before every run. */
  brief: string;
  /** Tools this agent may call on registered MCP servers, `serverId::tool`. */
  mcpTools?: string[];
  worldVerified: boolean;
  worldNullifier: string;
  boundAt: number;
  status: "active" | "paused" | "frozen";
  subAccounts: SubAccount[];
  trust: AgentTrust;
  accent: string;
}

export interface Violation {
  kind: string;
  detail: string;
  plain: string;
}

export interface ActivityItem {
  id: string;
  agentId: string;
  subAccountId: string;
  ts: number;
  task: string;
  scenario: string;
  recipient: string;
  amountMist: string;
  reason: string;
  outcome: "auto_executed" | "override_executed" | "blocked" | "hard_blocked" | "awaiting_human" | "denied";
  diff: { verdict: string; violations: Violation[]; needsHuman: boolean; effectsDigest: string };
  dryRun: {
    status: string;
    balanceChanges: Array<{ owner: string; coinType: string; amount: string }>;
    objectChanges: Array<{ type: string; objectType?: string; objectId?: string; recipient?: string }>;
  };
  intercepta: { address: string; flagged: boolean; reason?: string; riskScore: number; source: string };
  dryRunSource: "chain" | "simulated";
  agentMode: "live" | "scripted";
  narration: string;
  steps: Array<{ tool: string; input: unknown; output: unknown }>;
  txDigest?: string;
  proofObjectId?: string;
  reviewed: boolean;
  guardrailBreaches?: Array<{ code: string; enforcedOnChain: boolean; plain: string }>;
  reviewAction?: "dismissed" | "address_banned" | "address_promoted";
  reviewedAt?: number;
}

export interface AgentTask {
  id: string;
  label: string;
  detail: string;
  scenario: string;
  environment: string;
}

export type OnboardingStep = "signin" | "verify" | "vault" | "agent" | "done";

export interface Onboarding {
  complete: boolean;
  step: OnboardingStep;
  credentials?: {
    operatorAddress: string;
    vaultObjectId?: string;
    packageId?: string;
    agentAddress?: string;
    issuedAt: number;
  };
}

export interface WalletSnapshot {
  onboarding: Onboarding;
  holdings: {
    /** The published vault's own balance — the pool. */
    vault: string;
    /** The sum of every envelope's claim on that pool. */
    allocated: string;
    agents: string;
    total: string;
    overAllocated: boolean;
  };
  operator: {
    worldVerified: boolean;
    worldNullifier: string;
    verifiedAt: number;
    handle: string;
    address?: string;
    signedInAt?: number;
  };
  agents: Agent[];
  activity: ActivityItem[];
  bannedAddresses: Array<{ address: string; bannedAt: number; reason: string }>;
  caught: ActivityItem[];
  approvals: ActivityItem[];
  tasks: AgentTask[];
  chainLive: boolean;
  worldSandbox: boolean;
  /** Set when World has already verified this operator for this action. */
  worldKnownHuman: KnownHuman | null;
  mcpServers: McpServerView[];
}

export interface McpToolView {
  name: string;
  description?: string;
}

/** A registered server as the browser sees it — never its auth header. */
export interface McpServerView {
  id: string;
  label: string;
  url: string;
  tools: McpToolView[];
  addedAt: number;
  lastProbedAt?: number;
  error?: string;
  hasAuth: boolean;
}

export const SUI = 1e9;

export function fmtSui(mist: string | bigint, digits = 3): string {
  const n = Number(mist) / SUI;
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function shortAddr(a: string): string {
  return a.length > 14 ? `${a.slice(0, 7)}…${a.slice(-5)}` : a;
}

export function timeAgo(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
