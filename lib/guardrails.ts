import type { ActivityItem, SubAccount } from "./wallet-store";

/**
 * The parameters an operator sets to bound what an agent may do.
 *
 * Two of these are also enforced on-chain (`per_tx_cap` and the rolling
 * window in allowance_vault.move) and are therefore the ones an agent
 * genuinely cannot exceed even if every line of this file were deleted.
 * The rest are policy this server applies before signing. That split is
 * worth keeping straight rather than presenting them as equally solid:
 * a chain-enforced ceiling and an app-enforced one fail very differently.
 */
export interface Guardrails {
  /** Chain-enforced. Largest single payment. */
  perTxCapMist: string;
  /** Chain-enforced. Rolling window length and its ceiling. */
  windowMs: number;
  windowCapMist: string;
  /** Policy. Total across a calendar day. */
  dailyCapMist?: string;
  /** Policy. Total to any one counterparty, all time. */
  perCounterpartyCapMist?: string;
  /** Policy. Refuse when a screen scores at or above this (0-100). */
  maxRiskScore: number;
  /** Policy. Always ask a human at or above this, even if allow-listed. */
  approvalThresholdMist?: string;
  /** Policy. Assets this envelope may spend at all. */
  allowedCoinTypes: string[];
}

export const DEFAULT_GUARDRAILS: Guardrails = {
  perTxCapMist: "50000000", // 0.05 SUI
  windowMs: 60_000,
  windowCapMist: "250000000", // 5 payments at the cap, matching window_cap() on-chain
  maxRiskScore: 70,
  allowedCoinTypes: ["0x2::sui::SUI"],
};

export type BreachCode =
  | "over_tx_cap"
  | "over_window_cap"
  | "over_daily_cap"
  | "over_counterparty_cap"
  | "risk_too_high"
  | "asset_not_allowed";

export interface Breach {
  code: BreachCode;
  /** Chain-enforced breaches would abort the Move call anyway. */
  enforcedOnChain: boolean;
  plain: string;
}

export interface GuardrailVerdict {
  breaches: Breach[];
  /** Clean, but large enough that a human should see it anyway. */
  needsApproval: boolean;
}

function sui(mist: string | bigint): string {
  return (Number(mist) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Checks a proposed payment against an envelope's guardrails.
 *
 * Deliberately returns every breach rather than the first: an operator
 * reading a blocked payment should see everything wrong with it, not be
 * walked through them one retry at a time.
 */
export function checkGuardrails(input: {
  guardrails: Guardrails;
  amountMist: bigint;
  coinType: string;
  recipient: string;
  riskScore: number;
  /** This envelope's history, for the cumulative limits. */
  history: ActivityItem[];
  now?: number;
}): GuardrailVerdict {
  const { guardrails: g, amountMist, coinType, recipient, riskScore } = input;
  const now = input.now ?? Date.now();
  const breaches: Breach[] = [];

  if (amountMist > BigInt(g.perTxCapMist)) {
    breaches.push({
      code: "over_tx_cap",
      enforcedOnChain: true,
      plain: `${sui(amountMist)} SUI is over this envelope's ${sui(g.perTxCapMist)} SUI limit for a single payment.`,
    });
  }

  if (!g.allowedCoinTypes.includes(coinType)) {
    breaches.push({
      code: "asset_not_allowed",
      enforcedOnChain: false,
      plain: `This envelope isn't allowed to spend ${coinType.split("::").pop() ?? coinType}.`,
    });
  }

  if (riskScore >= g.maxRiskScore) {
    breaches.push({
      code: "risk_too_high",
      enforcedOnChain: false,
      plain: `The counterparty screened at ${riskScore}/100, at or above this envelope's limit of ${g.maxRiskScore}.`,
    });
  }

  // Only payments that actually moved money count toward cumulative caps.
  const settled = input.history.filter(
    (a) => a.outcome === "auto_executed" || a.outcome === "override_executed"
  );

  const windowSpent = settled
    .filter((a) => a.ts >= now - g.windowMs)
    .reduce((n, a) => n + BigInt(a.amountMist), 0n);
  if (windowSpent + amountMist > BigInt(g.windowCapMist)) {
    breaches.push({
      code: "over_window_cap",
      enforcedOnChain: true,
      plain: `This would take the current window to ${sui(windowSpent + amountMist)} SUI, over its ${sui(g.windowCapMist)} SUI ceiling.`,
    });
  }

  if (g.dailyCapMist) {
    const today = startOfDay(now);
    const daySpent = settled.filter((a) => a.ts >= today).reduce((n, a) => n + BigInt(a.amountMist), 0n);
    if (daySpent + amountMist > BigInt(g.dailyCapMist)) {
      breaches.push({
        code: "over_daily_cap",
        enforcedOnChain: false,
        plain: `This would take today's spend to ${sui(daySpent + amountMist)} SUI, over the ${sui(g.dailyCapMist)} SUI daily cap.`,
      });
    }
  }

  if (g.perCounterpartyCapMist) {
    const toThem = settled
      .filter((a) => a.recipient === recipient)
      .reduce((n, a) => n + BigInt(a.amountMist), 0n);
    if (toThem + amountMist > BigInt(g.perCounterpartyCapMist)) {
      breaches.push({
        code: "over_counterparty_cap",
        enforcedOnChain: false,
        plain: `This counterparty would reach ${sui(toThem + amountMist)} SUI total, over the ${sui(g.perCounterpartyCapMist)} SUI limit for any one of them.`,
      });
    }
  }

  const needsApproval =
    Boolean(g.approvalThresholdMist) && amountMist >= BigInt(g.approvalThresholdMist!);

  return { breaches, needsApproval };
}

/** Pulls guardrails off an envelope, filling anything unset with defaults. */
export function guardrailsFor(sub: SubAccount): Guardrails {
  return {
    ...DEFAULT_GUARDRAILS,
    ...(sub.guardrails ?? {}),
    // The two chain-enforced values always come from the envelope itself,
    // because that's what the Vault object actually holds.
    perTxCapMist: sub.perTxCapMist,
    windowMs: sub.windowMs,
    windowCapMist: sub.guardrails?.windowCapMist ?? (BigInt(sub.perTxCapMist) * 5n).toString(),
  };
}
