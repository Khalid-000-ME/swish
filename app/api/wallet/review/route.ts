import { NextRequest, NextResponse } from "next/server";
import { walletState, findSubAccount, blockedOnlyByAllowlist } from "@/lib/wallet-store";
import { validateAgentCallback } from "@/lib/world";
import { addToAllowlistOnChain, isMintConfigured } from "@/lib/mint";
import { toJsonSafe } from "@/lib/json";

/**
 * Triage a caught declaration. Three exits:
 *
 *  - dismiss  — acknowledge and clear it from the queue
 *  - ban      — this address is never payable by any agent again
 *  - promote  — add it to the envelope's allow-list, which is the only
 *               action that *grants* authority, and so is the only one
 *               that costs a fresh World ID verification. Promotion is
 *               decided server-side: the client asks, it never asserts.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { activityId, action, label, worldDecision } = body as {
    activityId?: string;
    action?: "dismiss" | "ban" | "promote";
    label?: string;
    worldDecision?: "approve" | "deny";
  };

  if (!activityId || !action) {
    return NextResponse.json({ error: "activityId and action are required" }, { status: 400 });
  }

  const state = walletState();
  const item = state.activity.find((a) => a.id === activityId);
  if (!item) return NextResponse.json({ error: "no such activity item" }, { status: 404 });

  try {
    if (action === "dismiss") {
      item.reviewed = true;
      item.reviewAction = "dismissed";
      item.reviewedAt = Date.now();
      return NextResponse.json(toJsonSafe({ item }));
    }

    if (action === "ban") {
      if (!state.bannedAddresses.some((b) => b.address === item.recipient)) {
        state.bannedAddresses.push({
          address: item.recipient,
          bannedAt: Date.now(),
          reason: item.intercepta.reason ?? item.diff.violations[0]?.plain ?? "Caught during review.",
        });
      }
      item.reviewed = true;
      item.reviewAction = "address_banned";
      item.reviewedAt = Date.now();
      return NextResponse.json(toJsonSafe({ item, banned: state.bannedAddresses }));
    }

    // promote — grants standing authority, so it needs a verified human.
    const verification = await validateAgentCallback({
      state: `promote:${activityId}`,
      sandboxDecision: worldDecision,
    });

    if (!verification.approved) {
      return NextResponse.json(
        toJsonSafe({ item, promoted: false, reason: "World verification was not completed." })
      );
    }

    const sub = findSubAccount(item.agentId, item.subAccountId);
    if (!sub) return NextResponse.json({ error: "sub-account no longer exists" }, { status: 404 });

    // The chain decides, so put it there first — a local-only promotion
    // would abort with E_NOT_ALLOWLISTED the first time it was used.
    let onChainDigest: string | undefined;
    if (isMintConfigured() && sub.onChain && sub.vaultObjectId) {
      try {
        onChainDigest = (await addToAllowlistOnChain({ vaultObjectId: sub.vaultObjectId, address: item.recipient })).digest;
      } catch (e) {
        return NextResponse.json(
          toJsonSafe({
            item,
            promoted: false,
            reason: `Could not add this address to the on-chain vault: ${e instanceof Error ? e.message : e}`,
          }),
          { status: 502 }
        );
      }
    }

    if (!sub.allowlist.some((a) => a.address === item.recipient)) {
      sub.allowlist.push({
        address: item.recipient,
        label: label?.trim() || "Promoted from review",
        addedAt: Date.now(),
        addedVia: "promoted_from_review",
        approvedBy: verification.nullifierHash,
        totalPaidMist: "0",
      });
    }

    item.reviewed = true;
    item.reviewAction = "address_promoted";
    item.reviewedAt = Date.now();

    // Every other pending item held up *only* by this counterparty not
    // being cleared is now answered too — the reason stopped being true
    // the moment the address went on the list. Leaving them in the queue
    // would ask the operator to approve the same decision repeatedly.
    // Items with another reason stay, because that reason still holds.
    let alsoCleared = 0;
    for (const other of state.activity) {
      if (other.id === item.id || other.reviewed) continue;
      if (other.subAccountId !== item.subAccountId) continue;
      if (other.recipient !== item.recipient) continue;
      if (other.outcome !== "blocked") continue;
      if (!blockedOnlyByAllowlist(other)) continue;

      other.reviewed = true;
      other.reviewAction = "address_promoted";
      other.reviewedAt = Date.now();
      alsoCleared += 1;
    }

    return NextResponse.json(
      toJsonSafe({ item, promoted: true, subAccount: sub, onChainDigest, alsoCleared })
    );
  } catch (err) {
    console.error("[swish] /api/wallet/review failed", err);
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
