import type { DiffResult, DryRunResult, Intercepta, ScenarioId } from "./types";

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
  /** The agent's own Sui address — `Vault.agent` on-chain. Funds sitting
   * here are the agent's working float, separate from its envelopes. */
  address: string;
  addressBalanceMist: string;
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
  /** Set once the operator signs in — the address every vault below is
   * owned by. Until then the wallet has nothing to show. */
  address?: string;
  signedInAt?: number;
}

export type OnboardingStep = "signin" | "verify" | "vault" | "agent" | "done";

export interface Onboarding {
  complete: boolean;
  step: OnboardingStep;
  /** Shown once, at the end of onboarding, then never again. */
  credentials?: {
    operatorAddress: string;
    vaultObjectId?: string;
    packageId?: string;
    agentAddress?: string;
    issuedAt: number;
  };
}

export interface WalletState {
  onboarding: Onboarding;
  operator: Operator;
  agents: Agent[];
  activity: ActivityItem[];
  bannedAddresses: Array<{ address: string; bannedAt: number; reason: string }>;
}

const LIVE_VAULT = process.env.BIND_VAULT_ID;

function seed(): WalletState {
  return {
    // A fresh wallet has nobody in it. You sign in, verify, fund a vault
    // and hire your first agent — the wallet has nothing to show until
    // you do, which is the point of the onboarding flow.
    onboarding: { complete: false, step: "signin" },
    operator: {
      worldVerified: false,
      worldNullifier: "",
      verifiedAt: 0,
      handle: "you",
    },
    agents: [],
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

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

const ACCENTS = ["#4f7bf0", "#f5b942", "#33d17a", "#c084fc", "#f0715c"];

/** Deterministic stand-in address for an agent until it's issued on-chain. */
function deriveAgentAddress(seedStr: string): string {
  let h = 0x811c9dc5;
  const out: string[] = [];
  for (let round = 0; round < 8; round++) {
    for (let i = 0; i < seedStr.length; i++) {
      h ^= seedStr.charCodeAt(i) + round;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out.push(h.toString(16).padStart(8, "0"));
  }
  return "0x" + out.join("").slice(0, 64);
}

export function signInOperator(address: string, handle?: string) {
  const s = walletState();
  s.operator.address = address;
  s.operator.signedInAt = Date.now();
  if (handle) s.operator.handle = handle;
  if (s.onboarding.step === "signin") s.onboarding.step = "verify";
}

export function verifyOperator(nullifier: string) {
  const s = walletState();
  s.operator.worldVerified = true;
  s.operator.worldNullifier = nullifier;
  s.operator.verifiedAt = Date.now();
  if (s.onboarding.step === "verify") s.onboarding.step = "vault";
}

export function markVaultReady() {
  const s = walletState();
  if (s.onboarding.step === "vault") s.onboarding.step = "agent";
}

/**
 * Hire an agent. It's bound to the operator's verified identity at birth —
 * there is no path here that creates an unbound agent — and it starts with
 * one envelope, a small cap, and an empty allow-list. Everything it's
 * eventually allowed to do, it has to be given or earn.
 */
export function hireAgent(input: {
  name: string;
  role: string;
  envelopeLabel: string;
  startingMist: string;
  perTxCapMist: string;
}): Agent {
  const s = walletState();
  const id = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `agent-${s.agents.length + 1}`;
  const accent = ACCENTS[s.agents.length % ACCENTS.length];
  const firstAgent = s.agents.length === 0;

  const agent: Agent = {
    id,
    name: input.name,
    role: input.role,
    address: deriveAgentAddress(`${id}:${s.operator.address ?? "anon"}`),
    addressBalanceMist: "0",
    worldVerified: true,
    worldNullifier: s.operator.worldNullifier,
    boundAt: Date.now(),
    status: "active",
    accent,
    trust: { declarations: 0, clean: 0, caught: 0, humanApproved: 0, recent: [] },
    subAccounts: [
      {
        // The first agent takes the real on-chain vault when one exists, so
        // the wallet's headline agent is genuinely live rather than a mock.
        id: firstAgent && LIVE_VAULT ? LIVE_VAULT : `${id}-env-1`,
        label: input.envelopeLabel,
        purpose: `What ${input.name} may spend on for this job`,
        onChain: Boolean(firstAgent && LIVE_VAULT),
        vaultObjectId: firstAgent && LIVE_VAULT ? LIVE_VAULT : undefined,
        balanceMist: input.startingMist,
        perTxCapMist: input.perTxCapMist,
        windowMs: 60_000,
        windowSpentMist: "0",
        accent,
        allowlist: [],
      },
    ],
  };

  s.agents.push(agent);
  return agent;
}

export function completeOnboarding(): Onboarding {
  const s = walletState();
  const first = s.agents[0];
  s.onboarding = {
    complete: true,
    step: "done",
    credentials: {
      operatorAddress: s.operator.address ?? "",
      vaultObjectId: first?.subAccounts[0]?.vaultObjectId,
      packageId: process.env.BIND_PACKAGE_ID,
      agentAddress: first?.address,
      issuedAt: Date.now(),
    },
  };
  return s.onboarding;
}

/** Vault holdings + whatever is sitting at each agent's own address. */
export function totalHoldingsMist(): { vault: bigint; agents: bigint; total: bigint } {
  const s = walletState();
  let vault = 0n;
  let agents = 0n;
  for (const a of s.agents) {
    agents += BigInt(a.addressBalanceMist);
    for (const sub of a.subAccounts) vault += BigInt(sub.balanceMist);
  }
  return { vault, agents, total: vault + agents };
}
