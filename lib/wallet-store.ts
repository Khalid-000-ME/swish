import type { DiffResult, DryRunResult, Intercepta, ScenarioId } from "./types";
import { DEMO_ADDRESSES } from "@/fixtures/addresses";

/**
 * The wallet's state model.
 *
 * The shape here is the product argument: a human is not handed "an agent
 * wallet" — they're handed a roster of agents, each bound to *their* World
 * identity, and each agent's money is split into purpose-scoped
 * sub-accounts rather than one pooled balance. A compromised agent can
 * only ever reach the envelope it was working out of, at that envelope's
 * cap, to that envelope's allow-list. Everything else stays sealed.
 *
 * On-chain, a sub-account *is* a `Vault<SUI>` object (bind/sources/
 * allowance_vault.move) — the envelope model isn't UI dressing, it's the
 * existing object model surfaced honestly.
 */

export interface AllowlistEntry {
  address: string;
  label: string;
  addedAt: number;
  addedVia: "seeded" | "manual" | "promoted_from_review";
  /** World nullifier of the human who approved this address, when promoted. */
  approvedBy?: string;
  lastPaidAt?: number;
  totalPaidMist: string;
}

export interface SubAccount {
  id: string;
  label: string;
  purpose: string;
  /** True when this envelope is a real, published Vault<SUI> object. */
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
  /** Rolling record of recent outcomes, newest last — drives the sparkline. */
  recent: Array<"clean" | "caught" | "human">;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  /** Every agent is bound to the operator's verified World identity.
   * No verification, no agent — this is the spine, not a feature. */
  worldVerified: boolean;
  worldNullifier: string;
  boundAt: number;
  status: "active" | "paused" | "frozen";
  subAccounts: SubAccount[];
  trust: AgentTrust;
  accent: string;
}

export type ActivityOutcome =
  | "auto_executed"
  | "override_executed"
  | "blocked"
  | "hard_blocked"
  | "awaiting_human"
  | "denied";

export interface ActivityItem {
  id: string;
  agentId: string;
  subAccountId: string;
  ts: number;
  task: string;
  scenario: ScenarioId;
  recipient: string;
  amountMist: string;
  reason: string;
  outcome: ActivityOutcome;
  diff: DiffResult;
  dryRun: DryRunResult;
  intercepta: Intercepta;
  dryRunSource: "chain" | "simulated";
  agentMode: "live" | "scripted";
  narration: string;
  steps: Array<{ tool: string; input: unknown; output: unknown }>;
  txDigest?: string;
  proofObjectId?: string;
  /** Caught items stay in the review queue until the operator acts. */
  reviewed: boolean;
  reviewAction?: "dismissed" | "address_banned" | "address_promoted";
  reviewedAt?: number;
}

export interface Operator {
  worldVerified: boolean;
  worldNullifier: string;
  verifiedAt: number;
  handle: string;
}

export interface WalletState {
  operator: Operator;
  agents: Agent[];
  activity: ActivityItem[];
  bannedAddresses: Array<{ address: string; bannedAt: number; reason: string }>;
}

const LIVE_VAULT = process.env.BIND_VAULT_ID;

function seed(): WalletState {
  const now = Date.now();
  return {
    operator: {
      worldVerified: true,
      worldNullifier: "0xsandbox-operator-nullifier",
      verifiedAt: now - 1000 * 60 * 60 * 26,
      handle: "you",
    },
    agents: [
      {
        id: "atlas",
        name: "Atlas",
        role: "Market data & research",
        worldVerified: true,
        worldNullifier: "0xsandbox-operator-nullifier",
        boundAt: now - 1000 * 60 * 60 * 26,
        status: "active",
        accent: "#4f7bf0",
        trust: { declarations: 0, clean: 0, caught: 0, humanApproved: 0, recent: [] },
        subAccounts: [
          {
            id: LIVE_VAULT ?? "sub-atlas-data",
            label: "Data subscriptions",
            purpose: "Paid feeds and API calls this agent needs to do its job",
            onChain: Boolean(LIVE_VAULT),
            vaultObjectId: LIVE_VAULT,
            balanceMist: "200000000",
            perTxCapMist: "2000000000",
            windowMs: 60_000,
            windowSpentMist: "0",
            accent: "#4f7bf0",
            allowlist: [
              {
                address: DEMO_ADDRESSES.allowlistedMerchant,
                label: "Helios Data Co.",
                addedAt: now - 1000 * 60 * 60 * 20,
                addedVia: "seeded",
                totalPaidMist: "200000000",
                lastPaidAt: now - 1000 * 60 * 42,
              },
            ],
          },
          {
            id: "sub-atlas-compute",
            label: "Compute",
            purpose: "Inference and sandbox execution — sealed off from the data envelope",
            onChain: false,
            balanceMist: "150000000",
            perTxCapMist: "500000000",
            windowMs: 60_000,
            windowSpentMist: "0",
            accent: "#33d17a",
            allowlist: [],
          },
        ],
      },
      {
        id: "ledger",
        name: "Ledger",
        role: "Vendor payouts",
        worldVerified: true,
        worldNullifier: "0xsandbox-operator-nullifier",
        boundAt: now - 1000 * 60 * 60 * 9,
        status: "active",
        accent: "#f5b942",
        trust: { declarations: 0, clean: 0, caught: 0, humanApproved: 0, recent: [] },
        subAccounts: [
          {
            id: "sub-ledger-payouts",
            label: "Vendor payouts",
            purpose: "Recurring invoices to counterparties you've already cleared",
            onChain: false,
            balanceMist: "900000000",
            perTxCapMist: "1000000000",
            windowMs: 60_000,
            windowSpentMist: "0",
            accent: "#f5b942",
            allowlist: [
              {
                address: DEMO_ADDRESSES.allowlistedMerchant,
                label: "Helios Data Co.",
                addedAt: now - 1000 * 60 * 60 * 8,
                addedVia: "seeded",
                totalPaidMist: "0",
              },
            ],
          },
        ],
      },
    ],
    activity: [],
    bannedAddresses: [],
  };
}

const g = globalThis as unknown as { __bindWallet?: WalletState };
export function walletState(): WalletState {
  if (!g.__bindWallet) g.__bindWallet = seed();
  return g.__bindWallet;
}

export function findAgent(agentId: string): Agent | undefined {
  return walletState().agents.find((a) => a.id === agentId);
}

export function findSubAccount(agentId: string, subAccountId: string): SubAccount | undefined {
  return findAgent(agentId)?.subAccounts.find((s) => s.id === subAccountId);
}

/** Caught = stopped by a gate and not yet triaged by a human. */
export function caughtQueue(): ActivityItem[] {
  return walletState()
    .activity.filter((a) => (a.outcome === "blocked" || a.outcome === "hard_blocked") && !a.reviewed)
    .sort((x, y) => y.ts - x.ts);
}

export function approvalQueue(): ActivityItem[] {
  return walletState()
    .activity.filter((a) => a.outcome === "awaiting_human")
    .sort((x, y) => y.ts - x.ts);
}

export function recordOutcome(agent: Agent, outcome: ActivityOutcome) {
  agent.trust.declarations += 1;
  if (outcome === "auto_executed") {
    agent.trust.clean += 1;
    agent.trust.recent.push("clean");
  } else if (outcome === "override_executed") {
    agent.trust.humanApproved += 1;
    agent.trust.recent.push("human");
  } else if (outcome === "blocked" || outcome === "hard_blocked") {
    agent.trust.caught += 1;
    agent.trust.recent.push("caught");
  }
  agent.trust.recent = agent.trust.recent.slice(-24);
}
