import { NextRequest, NextResponse } from "next/server";
import { findSubAccount } from "@/lib/wallet-store";
import { toJsonSafe } from "@/lib/json";
import { suiToMist } from "@/lib/amount";

/**
 * Updates an envelope's guardrails.
 *
 * `perTxCap` and `windowMs` also live on the Vault object on chain, so
 * changing them here only tightens what this server will sign — the
 * on-chain ceiling still needs set_caps to move. Tightening locally is
 * always safe; loosening beyond the on-chain value simply won't take
 * effect, and the response says so rather than pretending it did.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { agentId, subAccountId, guardrails } = body as {
    agentId?: string;
    subAccountId?: string;
    guardrails?: {
      windowCapSui?: number;
      dailyCapSui?: number | null;
      perCounterpartyCapSui?: number | null;
      maxRiskScore?: number;
      approvalThresholdSui?: number | null;
      allowedCoinTypes?: string[];
    };
  };

  if (!agentId || !subAccountId || !guardrails) {
    return NextResponse.json({ error: "agentId, subAccountId and guardrails are required" }, { status: 400 });
  }

  const sub = findSubAccount(agentId, subAccountId);
  if (!sub) return NextResponse.json({ error: "no such envelope" }, { status: 404 });

  const next = { ...(sub.guardrails ?? {}) };

  if (guardrails.windowCapSui !== undefined) next.windowCapMist = suiToMist(guardrails.windowCapSui).toString();
  if (guardrails.maxRiskScore !== undefined) {
    next.maxRiskScore = Math.max(0, Math.min(100, Math.round(guardrails.maxRiskScore)));
  }
  if (guardrails.allowedCoinTypes) next.allowedCoinTypes = guardrails.allowedCoinTypes;

  // null clears a limit; undefined leaves it alone.
  if (guardrails.dailyCapSui !== undefined) {
    next.dailyCapMist = guardrails.dailyCapSui === null ? undefined : suiToMist(guardrails.dailyCapSui).toString();
  }
  if (guardrails.perCounterpartyCapSui !== undefined) {
    next.perCounterpartyCapMist =
      guardrails.perCounterpartyCapSui === null ? undefined : suiToMist(guardrails.perCounterpartyCapSui).toString();
  }
  if (guardrails.approvalThresholdSui !== undefined) {
    next.approvalThresholdMist =
      guardrails.approvalThresholdSui === null ? undefined : suiToMist(guardrails.approvalThresholdSui).toString();
  }

  sub.guardrails = next;
  return NextResponse.json(toJsonSafe({ subAccount: sub }));
}
