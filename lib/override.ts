import { pendingStore, type PendingExecution } from "./store";
import { attestOverride } from "./world";
import { digestBytes } from "./attest";
import { mintDeclarationOnChain, mintOverrideApprovalOnChain, executeWithOverrideOnChain, isMintConfigured } from "./mint";

export interface OverrideOutcome {
  found: boolean;
  status: "override_executed" | "blocked" | "expired";
  approvalObjectId?: string;
  txDigest?: string;
}

/**
 * The shared completion path for both the sandbox "approve/deny" button
 * and a real World OIDC callback (BIND_PRD.md §8.2). Denied and expired
 * are first-class outcomes here, not error handling — there is simply no
 * object minted, and the declaration in `pendingStore` is dropped either
 * way, so nothing downstream can act on a decision that never happened.
 */
export async function completeOverride(
  declarationId: string,
  decision: "approve" | "deny",
  nullifierHash: string
): Promise<OverrideOutcome> {
  const pending = pendingStore.get(declarationId);
  if (!pending) return { found: false, status: "expired" };

  if (Date.now() > pending.declaration.expiresMs) {
    pendingStore.delete(declarationId);
    return { found: true, status: "expired" };
  }

  if (decision === "deny") {
    pendingStore.delete(declarationId);
    return { found: true, status: "blocked" };
  }

  let approvalObjectId: string;
  let txDigest: string;

  if (isMintConfigured()) {
    const onChainDecl = await mintDeclarationOnChain(pending.declaration);
    const att = await attestOverride({
      declarationId: onChainDecl.declarationObjectId,
      effectsDigest: pending.diff.effectsDigest,
      nullifierHash,
    });
    const minted = await mintOverrideApprovalOnChain({
      declarationId: onChainDecl.declarationObjectId,
      effectsDigest: pending.diff.effectsDigest,
      nullifierHashHex: att.nullifierHashHex,
      verifiedAtMs: att.verifiedAtMs,
      attestation: att.attestation,
    });
    approvalObjectId = minted.approvalObjectId;
    const executed = await executeWithOverrideOnChain({
      declarationObjectId: onChainDecl.declarationObjectId,
      overrideApprovalId: minted.approvalObjectId,
    });
    txDigest = executed.digest;
  } else {
    approvalObjectId = digestBytes(new TextEncoder().encode("override:" + declarationId));
    txDigest = digestBytes(new TextEncoder().encode("tx-override:" + declarationId));
  }

  pendingStore.delete(declarationId);
  return { found: true, status: "override_executed", approvalObjectId, txDigest };
}

export function getPending(declarationId: string): PendingExecution | undefined {
  return pendingStore.get(declarationId);
}
