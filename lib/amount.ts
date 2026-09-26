/**
 * Deterministic money math. Per BIND_PRD.md §10: "The agent must call
 * `computeAmount` before `declareIntent`... Amounts come only from
 * `computeAmount`. If a number appears in a declaration that the
 * deterministic function did not produce, the backend rejects it."
 *
 * The LLM never does arithmetic. It calls this pure function as a tool,
 * and every number here is independently reproducible by anyone reading
 * this file — that reproducibility is the whole point.
 */

export const MIST_PER_SUI = 1_000_000_000n;

export function suiToMist(sui: number): bigint {
  // avoid float error by working in integer cents-of-mist
  return BigInt(Math.round(sui * 1e9));
}

export function mistToSui(mist: bigint): number {
  return Number(mist) / 1e9;
}

export interface FeedPurchaseTerms {
  feedId?: string;
  unitPriceMist: bigint;
  units: number;
}

/** What an x402-gated data purchase actually costs — no model guessing. */
export function computeFeedCost({ unitPriceMist, units }: FeedPurchaseTerms): bigint {
  if (units <= 0) throw new Error("units must be positive");
  return unitPriceMist * BigInt(units);
}

export interface PayoutInput {
  invoiceAmountMist: bigint;
  feePercentBps: number; // basis points, e.g. 50 = 0.5%
  capMist: bigint;
}

/** The amount a declaration is allowed to name for a routine payout. */
export function computeDeclaredAmount({ invoiceAmountMist, feePercentBps, capMist }: PayoutInput): bigint {
  const fee = (invoiceAmountMist * BigInt(feePercentBps)) / 10_000n;
  const total = invoiceAmountMist + fee;
  return total > capMist ? capMist : total;
}

export function reasonHash(reason: string): string {
  // Keeps a stable, inspectable digest of the agent's plain-language reason
  // without pulling a hashing dependency into this pure module.
  let h1 = 0xdeadbeef ^ reason.length;
  let h2 = 0x41c6ce57 ^ reason.length;
  for (let i = 0; i < reason.length; i++) {
    const ch = reason.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const combined = (BigInt(h2 >>> 0) << 32n) | BigInt(h1 >>> 0);
  return combined.toString(16).padStart(16, "0");
}
