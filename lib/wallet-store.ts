import type { DiffResult, DryRunResult, Intercepta, ScenarioId } from "./types";
import { createAgentIdentity, recallSealed } from "./agent-keys";
import { defaultBrief } from "./agent-brief";
import type { McpServer } from "./mcp-servers";
import type { Guardrails } from "./guardrails";

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
  /** Policy on top of the chain-enforced caps. Unset fields fall back to
   *  DEFAULT_GUARDRAILS — see lib/guardrails.ts. */
  guardrails?: Partial<Guardrails>;
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
  /** AES-GCM sealed Ed25519 secret. Stripped before this ever reaches a
   *  browser — see stripSecrets(). */
  sealedSecret?: string;
  /** The operator's own description of the job, in Markdown. Fed to the
   *  model verbatim before every run — see lib/agent-brief.ts. */
  brief: string;
  /** Tools from registered MCP servers this agent may call, as
   *  `serverId::toolName`. Enforced where the loop is built, not just
   *  shown — see lib/mcp-servers.ts. */
  mcpTools?: string[];
  /** False when no master key is configured: the address is real and can
   *  receive, but nothing here can sign for it. */
  signable: boolean;
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
  /** Guardrails this payment broke, if any. */
  guardrailBreaches?: Array<{ code: string; enforcedOnChain: boolean; plain: string }>;
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
  /** Servers the operator registered for agents to call out to. */
  mcpServers: McpServer[];
  /**
   * The published vault, as a pool the operator owns.
   *
   * It used to have no representation of its own: the first agent's
   * envelope *was* the vault object, so the wallet's "in vaults" figure
   * and that agent's balance were necessarily the same number, topping up
   * the vault topped up one agent, and every agent after the first got
   * nothing backed by anything. An envelope is supposed to be carved out
   * of the vault, not be it.
   */
  vault: {
    objectId?: string;
    /** Refreshed from the vault object; the pool every envelope draws on. */
    balanceMist: string;
  };
}

const LIVE_VAULT = process.env.SWISH_VAULT_ID;

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
    mcpServers: [],
    vault: { objectId: LIVE_VAULT, balanceMist: "0" },
  };
}

const g = globalThis as unknown as { __bindWallet?: WalletState };
/**
 * Throws away the wallet and starts from an empty one.
 *
 * Only this in-memory view: the keystore keeps the old agents' sealed
 * secrets, so an address that was funded before a reset isn't stranded —
 * it can be brought back by hand if it turns out to matter.
 */
export function resetWalletState(): void {
  g.__bindWallet = seed();
}

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

  // The id comes from the name, so two agents called the same thing would
  // have collided — findAgent returns the first match, and the second
  // agent's page, guardrails and activity would all have silently belonged
  // to the first. Only reachable now that a second agent can be hired at
  // all, which is what surfaced it.
  const base = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "agent";
  let id = base;
  for (let n = 2; s.agents.some((a) => a.id === id); n++) id = `${base}-${n}`;

  const accent = ACCENTS[s.agents.length % ACCENTS.length];

  const identity = createAgentIdentity();

  const agent: Agent = {
    id,
    name: input.name,
    role: input.role,
    address: identity.address,
    sealedSecret: identity.sealedSecret,
    brief: defaultBrief({ name: input.name, role: input.role, envelopeLabel: input.envelopeLabel }),
    signable: identity.signable,
    addressBalanceMist: "0",
    worldVerified: true,
    worldNullifier: s.operator.worldNullifier,
    boundAt: Date.now(),
    status: "active",
    accent,
    trust: { declarations: 0, clean: 0, caught: 0, humanApproved: 0, recent: [] },
    subAccounts: [
      {
        // Every envelope is its own thing, with its own id. The first one
        // used to *be* the vault object, which made the agent and the
        // vault indistinguishable and left later agents backed by nothing.
        id: `${id}-env-1`,
        label: input.envelopeLabel,
        purpose: `What ${input.name} may spend on for this job`,
        // Backed by the published vault: withdrawals for this envelope come
        // out of that pool. It is an allocation from the vault, not the
        // vault itself.
        onChain: Boolean(LIVE_VAULT),
        vaultObjectId: LIVE_VAULT,
        // What the operator earmarked, which is a claim on the pool rather
        // than a separate balance. Sums above the pool are shown as
        // over-allocated rather than silently treated as money.
        balanceMist: input.startingMist,
        perTxCapMist: input.perTxCapMist,
        windowMs: 60_000,
        windowSpentMist: "0",
        accent,
        allowlist: [],
        guardrails: {
          windowCapMist: (BigInt(input.perTxCapMist) * 5n).toString(),
          maxRiskScore: 70,
          allowedCoinTypes: ["0x2::sui::SUI"],
        },
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
      packageId: process.env.SWISH_PACKAGE_ID,
      agentAddress: first?.address,
      issuedAt: Date.now(),
    },
  };
  return s.onboarding;
}

/**
 * What the wallet actually holds, and what has been promised out of it.
 *
 * `vault` is the pool, read from the vault object. `allocated` is the sum
 * of every envelope's claim on it — which is not more money, it's the same
 * money spoken for. Adding the two together, which the old version did,
 * counted the vault once per envelope.
 */
export function totalHoldingsMist(): {
  vault: bigint;
  allocated: bigint;
  agents: bigint;
  total: bigint;
} {
  const s = walletState();
  const vault = BigInt(s.vault.balanceMist);
  let allocated = 0n;
  let agents = 0n;
  for (const a of s.agents) {
    agents += BigInt(a.addressBalanceMist);
    for (const sub of a.subAccounts) allocated += BigInt(sub.balanceMist);
  }
  return { vault, allocated, agents, total: vault + agents };
}

/**
 * Restores a snapshot the browser kept. Refuses when the server already
 * has a wallet in progress — the browser's copy is a backup for a cold
 * start, not an authority that can overwrite live state.
 */
export function replaceWalletState(incoming: WalletState): { hydrated: boolean; reason?: string } {
  const current = walletState();
  if (current.onboarding.complete || current.agents.length > 0) {
    return { hydrated: false, reason: "server already has wallet state" };
  }
  if (!incoming?.onboarding || !Array.isArray(incoming.agents)) {
    return { hydrated: false, reason: "snapshot is not a wallet" };
  }

  // The browser's copy went through `stripSecrets`, so its agents arrive
  // with no key. Without this they'd come back as addresses that can
  // receive money and never spend it — a restart would orphan every
  // agent, funded address included. The keystore is the server's own,
  // and the browser never had anything to do with it.
  const agents = incoming.agents.map((incomingAgent) => {
    // Agents predating the brief arrive without one; a blank page there
    // would read as "the operator deleted it" rather than "this is old".
    const agent = incomingAgent.brief
      ? incomingAgent
      : {
          ...incomingAgent,
          brief: defaultBrief({
            name: incomingAgent.name,
            role: incomingAgent.role,
            envelopeLabel: incomingAgent.subAccounts[0]?.label ?? "Working budget",
          }),
        };

    if (agent.sealedSecret) return agent;
    const sealedSecret = recallSealed(agent.address);
    return sealedSecret ? { ...agent, sealedSecret, signable: true } : { ...agent, signable: false };
  });

  g.__bindWallet = {
    onboarding: incoming.onboarding,
    operator: incoming.operator,
    agents,
    activity: incoming.activity ?? [],
    bannedAddresses: incoming.bannedAddresses ?? [],
    mcpServers: incoming.mcpServers ?? [],
    vault: incoming.vault ?? { objectId: LIVE_VAULT, balanceMist: "0" },
  };
  return { hydrated: true };
}

/** The wallet as the browser may see it — no key material, ever. */
export function stripSecrets(state: WalletState): WalletState {
  return {
    ...state,
    agents: state.agents.map((agent) => {
      const copy = { ...agent };
      delete copy.sealedSecret;
      return copy;
    }),
    // An MCP server's Authorization header is a credential like any other.
    // The browser persists this snapshot to localStorage, so it must not
    // travel in it.
    mcpServers: state.mcpServers.map((server) => {
      const copy = { ...server };
      delete copy.authHeader;
      return copy;
    }),
  };
}

/**
 * Refreshes each agent's on-chain balance. Agents hold real addresses
 * now, so "held by agents" in the balance header is a live number rather
 * than a hardcoded zero — and it reads whatever anyone has sent them,
 * which is the point of giving them an address at all.
 */
export async function refreshAgentBalances(): Promise<void> {
  const s = walletState();
  const { suiClient, readVaultBalance } = await import("./sui");

  // The vault is one pool, read once. Envelopes keep their own
  // allocations — overwriting each of them with the pool's balance was
  // what made every envelope show the same number.
  if (s.vault.objectId) {
    const onChain = await readVaultBalance(s.vault.objectId);
    if (onChain !== null) s.vault.balanceMist = onChain.toString();
  }

  await Promise.all(
    s.agents.map(async (agent) => {
      try {
        const res = await suiClient().getBalance({ owner: agent.address, coinType: "0x2::sui::SUI" });
        agent.addressBalanceMist = String(res.balance.balance ?? "0");
      } catch {
        // A fullnode hiccup shouldn't blank out the balance we last saw.
      }
    })
  );
}

/**
 * Whether allow-listing this item's recipient would have let it through.
 *
 * A caught item can be blocked for several reasons at once, and only one
 * of them is fixed by clearing the counterparty. An item refused purely
 * for being over the cap will be refused again no matter how many times
 * its address is allowed — which is what "allow this address" looked like
 * doing nothing, because it genuinely was.
 */
export function blockedOnlyByAllowlist(item: ActivityItem): boolean {
  const reasons = [
    ...(item.diff?.violations ?? []).map((v) => v.plain),
    ...(item.guardrailBreaches ?? []).map((b) => b.plain),
  ];
  if (reasons.length === 0) return false;
  return reasons.every((r) => /allow-list/i.test(r));
}

/** Does clearing the counterparty address address any of its reasons? */
export function mentionsAllowlist(item: ActivityItem): boolean {
  const reasons = [
    ...(item.diff?.violations ?? []).map((v) => v.plain),
    ...(item.guardrailBreaches ?? []).map((b) => b.plain),
  ];
  return reasons.some((r) => /allow-list/i.test(r));
}
