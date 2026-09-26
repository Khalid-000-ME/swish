/**
 * Shared types for the Swish demo. Mirrors the object model in
 * BIND_PRD.md §6 (Move) and §7 (the dry-run diff).
 */

export type CoinType = "0x2::sui::SUI";

export interface Declaration {
  id: string;
  vaultId: string;
  recipient: string;
  coinType: CoinType;
  maxAmount: bigint;
  expiresMs: number;
  reason: string;
  reasonHash: string;
  nonce: number;
}

export type ViolationKind =
  | "undeclared_beneficiary"
  | "undeclared_asset"
  | "amount_exceeds"
  | "undeclared_object_transfer"
  | "capability_grant"
  | "object_destruction"
  | "unexpected_publish"
  | "dry_run_failed"
  | "expired"
  /** Raised against a transaction a connected site built, where the
   *  envelope's own rules stand in for a declaration. */
  | "site_transaction";

export interface Violation {
  kind: ViolationKind;
  detail: string;
  /** Plain-language line shown next to the raw diff — the sentence a judge quotes. */
  plain: string;
}

export interface BalanceChange {
  owner: string;
  coinType: string;
  amount: bigint; // negative = outflow from that owner
}

export interface ObjectChange {
  type: "created" | "transferred" | "deleted" | "published" | "mutated";
  objectType?: string;
  objectId?: string;
  recipient?: string;
}

export interface DryRunResult {
  status: "success" | "failure";
  error?: string;
  balanceChanges: BalanceChange[];
  objectChanges: ObjectChange[];
  effectsDigest: string;
}

export type DiffVerdict = "clean" | "violations" | "flagged";

export interface DiffResult {
  verdict: DiffVerdict;
  violations: Violation[];
  needsHuman: boolean;
  effectsDigest: string;
}

export interface VaultState {
  id: string;
  owner: string; // World-verified human
  agent: string; // attribution only — cannot itself sign
  balance: bigint;
  coinType: CoinType;
  allowlist: string[];
  perTxCap: bigint;
  windowMs: number;
  windowStart: number;
  windowSpent: bigint;
  frozen: boolean;
}

export interface Intercepta {
  address: string;
  flagged: boolean;
  reason?: string;
  riskScore: number; // 0-100
  source: "live" | "mock" | "unsupported" | "unconfigured" | "error";
}

export type ScenarioId =
  | "happy_path"
  | "villain_hidden_effects"
  | "villain_flagged_recipient"
  | "villain_escalation"
  | "override_denied";

export interface ExecutionEvent {
  id: string;
  ts: number;
  scenario: ScenarioId;
  declaration: Declaration;
  dryRun: DryRunResult;
  diff: DiffResult;
  intercepta?: Intercepta;
  worldStatus?: "not_required" | "pending" | "verified" | "denied" | "expired";
  outcome: "auto_executed" | "blocked" | "awaiting_human" | "override_executed" | "hard_blocked";
  proofObjectId?: string;
  txDigest?: string;
}
