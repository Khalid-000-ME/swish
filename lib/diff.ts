import type { Declaration, DiffResult, DryRunResult, Violation, VaultState } from "./types";

/** Anything shaped like a capability/admin/upgrade object — see BIND_PRD.md §7. */
const CAP_RE = /(::.*Cap\b|Capability|AdminCap|TreasuryCap|OwnerCap|UpgradeCap)/i;

function plainLine(v: Omit<Violation, "plain">): string {
  switch (v.kind) {
    case "undeclared_beneficiary":
      return `The chain would also send funds to ${v.detail}, which was never named in the declaration.`;
    case "undeclared_asset":
      return `The chain would move ${v.detail}, a different asset than the one declared.`;
    case "amount_exceeds":
      return `The actual outflow (${v.detail}) is larger than the declared maximum.`;
    case "undeclared_object_transfer":
      return `An object under the vault's control (${v.detail}) would be transferred to an address the declaration never mentioned.`;
    case "capability_grant":
      return `This transaction would create or hand over a capability object (${v.detail}) — a permission escalation the agent never declared.`;
    case "object_destruction":
      return `An object under the vault's control (${v.detail}) would be deleted.`;
    case "unexpected_publish":
      return `This transaction would publish new code — never part of a payment declaration.`;
    case "dry_run_failed":
      return `The simulation itself failed (${v.detail}) before any effects could be checked.`;
    case "expired":
      return `The declaration's expiry window has already passed.`;
    default:
      return v.detail;
  }
}

function violation(kind: Violation["kind"], detail: string): Violation {
  return { kind, detail, plain: plainLine({ kind, detail }) };
}

/**
 * The technical heart of Swish (BIND_PRD.md §7): diff the *actual* simulated
 * effects of a transaction against what the agent *declared* it would do.
 * Anything the chain would really do that the declaration never named comes
 * back as a violation, and a violation means no MatchProof gets minted.
 */
export function diffEffects(
  decl: Declaration,
  actual: DryRunResult,
  vault: Pick<VaultState, "id" | "allowlist" | "perTxCap">
): DiffResult {
  const violations: Violation[] = [];

  if (actual.status !== "success") {
    violations.push(violation("dry_run_failed", actual.error ?? "unknown"));
  }

  for (const bc of actual.balanceChanges) {
    const isVaultOutflow = bc.owner === vault.id && bc.amount < 0n;
    const isDeclaredInflow = bc.owner === decl.recipient && bc.amount > 0n;

    if (isVaultOutflow) {
      if (bc.coinType !== decl.coinType) {
        violations.push(violation("undeclared_asset", bc.coinType));
      }
      const outflow = -bc.amount;
      if (outflow > decl.maxAmount) {
        violations.push(
          violation("amount_exceeds", `${outflow} > declared ${decl.maxAmount}`)
        );
      }
    } else if (!isDeclaredInflow && bc.amount > 0n) {
      // Money landing somewhere that is neither the vault (change) nor the
      // declared recipient (the payment) is exactly the Bybit-shaped case.
      violations.push(violation("undeclared_beneficiary", bc.owner));
    }
  }

  for (const oc of actual.objectChanges) {
    if (oc.type === "transferred" && oc.recipient && oc.recipient !== decl.recipient && oc.objectId) {
      violations.push(violation("undeclared_object_transfer", oc.objectId));
    }
    if ((oc.type === "created" || oc.type === "transferred") && oc.objectType && CAP_RE.test(oc.objectType)) {
      violations.push(violation("capability_grant", oc.objectType));
    }
    if (oc.type === "deleted" && oc.objectId) {
      violations.push(violation("object_destruction", oc.objectId));
    }
    if (oc.type === "published") {
      violations.push(violation("unexpected_publish", "new module bytecode"));
    }
  }

  if (Date.now() > decl.expiresMs) {
    violations.push(violation("expired", new Date(decl.expiresMs).toISOString()));
  }

  const needsHuman = !vault.allowlist.includes(decl.recipient);
  const verdict: DiffResult["verdict"] = violations.length > 0 ? "violations" : "clean";

  return {
    verdict,
    violations,
    needsHuman,
    effectsDigest: actual.effectsDigest,
  };
}
