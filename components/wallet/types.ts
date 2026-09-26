// Client mirror of lib/wallet-store, post-JSON (bigints as strings).

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
}

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

export interface WalletSnapshot {
  operator: { worldVerified: boolean; worldNullifier: string; verifiedAt: number; handle: string };
  agents: Agent[];
  activity: ActivityItem[];
  bannedAddresses: Array<{ address: string; bannedAt: number; reason: string }>;
  caught: ActivityItem[];
  approvals: ActivityItem[];
  tasks: AgentTask[];
  chainLive: boolean;
  worldSandbox: boolean;
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
