import { NextRequest, NextResponse } from "next/server";
import { completeOverride } from "@/lib/override";
import { walletState, findAgent, findSubAccount, recordOutcome } from "@/lib/wallet-store";
import { toJsonSafe } from "@/lib/json";

/**
 * The operator resolving a parked declaration. Approving runs the real
 * override path (World-verified human approval -> OverrideApproval object
 * -> execute_with_override); denying mints nothing at all, which is what
 * makes the denial structural rather than a flag someone could flip back.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { activityId, decision, alsoAllow, label } = body as {
    activityId?: string;
    decision?: "approve" | "deny";
    /** Approve *and* grant standing permission, so this counterparty
     * stops interrupting you. Same verification already covers it. */
    alsoAllow?: boolean;
    label?: string;
  };

  if (!activityId || (decision !== "approve" && decision !== "deny")) {
    return NextResponse.json({ error: "activityId and decision are required" }, { status: 400 });
  }

  const state = walletState();
  const item = state.activity.find((a) => a.id === activityId);
  if (!item) return NextResponse.json({ error: "no such activity item" }, { status: 404 });

  try {
    const outcome = await completeOverride(activityId, decision, `0xsandbox-${activityId}`);
    const agent = findAgent(item.agentId);

    if (outcome.status === "override_executed") {
      item.outcome = "override_executed";
      item.txDigest = outcome.txDigest;
      item.proofObjectId = outcome.approvalObjectId;
      if (agent) recordOutcome(agent, "override_executed");

      const sub = findSubAccount(item.agentId, item.subAccountId);
      if (sub) {
        const spent = BigInt(item.amountMist);
        sub.balanceMist = (BigInt(sub.balanceMist) - spent).toString();
        sub.windowSpentMist = (BigInt(sub.windowSpentMist) + spent).toString();

        if (alsoAllow && !sub.allowlist.some((a) => a.address === item.recipient)) {
          sub.allowlist.push({
            address: item.recipient,
            label: label?.trim() || "Approved counterparty",
            addedAt: Date.now(),
            addedVia: "promoted_from_review",
            approvedBy: `0xsandbox-${activityId}`,
            totalPaidMist: spent.toString(),
            lastPaidAt: Date.now(),
          });
        }
      }
    } else {
      item.outcome = "denied";
      item.reviewed = true;
      item.reviewAction = "dismissed";
      item.reviewedAt = Date.now();
    }

    return NextResponse.json(toJsonSafe({ item, outcome }));
  } catch (err) {
    console.error("[bind] /api/wallet/approve failed", err);
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
