import { runBindAgent, type AgentRunResult } from "@/agent";
import { diffEffects } from "./diff";
import { screenCounterparty } from "./intercepta";
import { buildPtb, dryRun } from "./sui";
import { attestMatch, digestBytes } from "./attest";
import { mintDeclarationOnChain, mintMatchProofOnChain, executeDeclaredOnChain, isMintConfigured } from "./mint";
import { pendingStore } from "./store";
import { suiToMist } from "./amount";
import type { BuiltPtb } from "@/agent/tools";
import type { Declaration, DryRunResult, ExecutionEvent, Intercepta, ScenarioId } from "./types";
import { checkGuardrails, type Breach, type Guardrails } from "./guardrails";
import type { ActivityItem } from "./wallet-store";
import { BindSession } from "@/agent/session";

const DEMO_SENDER =
  process.env.BIND_DEMO_SENDER || "0x4b13e003946a7b677de38415d5395a9703c11f26ab0ed44675491dfcc1fd4869";

function syntheticDryRun(vaultId: string, decl: Declaration, ptb: BuiltPtb): DryRunResult {
  const balanceChanges = [{ owner: vaultId, coinType: decl.coinType, amount: -decl.maxAmount }];
  const objectChanges: DryRunResult["objectChanges"] = [];

  let declaredTotal = 0n;
  for (const leg of ptb.declaredLegs) {
    const amt = suiToMist(leg.amountSui);
    declaredTotal += amt;
    balanceChanges.push({ owner: leg.recipient, coinType: decl.coinType, amount: amt });
  }
  for (const leg of ptb.undeclaredLegs) {
    const amt = suiToMist(leg.amountSui);
    balanceChanges.push({ owner: leg.recipient, coinType: decl.coinType, amount: amt });
    objectChanges.push({
      type: "created",
      objectType: "0xbind::escalation::AdminCap",
      objectId: digestBytes(new TextEncoder().encode(leg.recipient + "cap")),
      recipient: leg.recipient,
    });
  }
  // vault outflow must cover both legs, not just the declared one
  balanceChanges[0].amount = -(declaredTotal + ptb.undeclaredLegs.reduce((s, l) => s + suiToMist(l.amountSui), 0n));

  return {
    status: "success",
    balanceChanges,
    objectChanges,
    effectsDigest: digestBytes(new TextEncoder().encode(JSON.stringify(ptb) + decl.id)),
  };
}

async function computeDryRun(session: BindSession, decl: Declaration, ptb: BuiltPtb): Promise<{ result: DryRunResult; source: "chain" | "simulated" }> {
  const spec = {
    sender: DEMO_SENDER,
    declaredLegs: ptb.declaredLegs.map((l) => [l.recipient, suiToMist(l.amountSui)] as [string, bigint]),
    undeclaredLegs: ptb.undeclaredLegs.map((l) => [l.recipient, suiToMist(l.amountSui)] as [string, bigint]),
  };
  try {
    const tx = buildPtb(spec);
    const real = await dryRun(tx, DEMO_SENDER);
    if (real) return { result: real, source: "chain" };
  } catch {
    // fall through — an RPC hiccup shouldn't take down the demo
  }
  return { result: syntheticDryRun(session.vault.id, decl, ptb), source: "simulated" };
}

export interface ScenarioRunResult extends ExecutionEvent {
  agent: Pick<AgentRunResult, "mode" | "narration" | "steps">;
  dryRunSource: "chain" | "simulated";
  interceptaSource: Intercepta["source"];
  guardrailBreaches: Breach[];
  worldSandbox: boolean;
}

export interface ScenarioOptions {
  /** The envelope's real allow-list, from the wallet. Without this the
   * diff falls back to the agent session's own defaults, and a freshly
   * hired agent with an empty allow-list would wrongly sail through — the
   * wallet promises the opposite, so the wallet's list wins. */
  allowlist?: string[];
  perTxCapMist?: bigint;
  /** The envelope's policy. Checked *before* anything executes — a
   * guardrail that only annotates a payment after the money moved isn't
   * a guardrail. */
  guardrails?: Guardrails;
  /** This envelope's settled history, for the cumulative limits. */
  history?: ActivityItem[];
}

export async function runScenario(scenario: ScenarioId, opts: ScenarioOptions = {}): Promise<ScenarioRunResult> {
  const run = await runBindAgent(scenario);
  const decl = run.outputs.declaration;
  const ptb = run.outputs.ptb;
  if (!decl || !ptb) {
    throw new Error("agent did not complete its declaration/build steps");
  }

  if (opts.allowlist) run.session.vault.allowlist = opts.allowlist;
  if (opts.perTxCapMist !== undefined) run.session.vault.perTxCap = opts.perTxCapMist;

  const { result: dryRunResult, source: dryRunSource } = await computeDryRun(run.session, decl, ptb);
  const diff = diffEffects(decl, dryRunResult, run.session.vault);
  const intercepta = await screenCounterparty(run.session.counterpartyEvm(), decl.recipient);

  const base = {
    id: decl.id,
    ts: Date.now(),
    scenario,
    declaration: decl,
    dryRun: dryRunResult,
    diff,
    intercepta,
    agent: { mode: run.mode, narration: run.narration, steps: run.steps },
    dryRunSource,
    interceptaSource: intercepta.source,
    worldSandbox: !process.env.WORLD_CLIENT_ID,
  };

  const verdict = opts.guardrails
    ? checkGuardrails({
        guardrails: opts.guardrails,
        amountMist: decl.maxAmount,
        coinType: decl.coinType,
        recipient: decl.recipient,
        riskScore: intercepta.riskScore,
        history: opts.history ?? [],
      })
    : { breaches: [] as Breach[], needsApproval: false };

  if (intercepta.flagged) {
    return { ...base, guardrailBreaches: verdict.breaches, worldStatus: "not_required", outcome: "hard_blocked" };
  }

  if (diff.verdict === "violations") {
    return { ...base, guardrailBreaches: verdict.breaches, worldStatus: "not_required", outcome: "blocked" };
  }

  // A payment can be exactly what was declared and still be more than
  // this envelope is permitted to spend. Checked here, before any
  // minting or execution happens.
  if (verdict.breaches.length > 0) {
    return { ...base, guardrailBreaches: verdict.breaches, worldStatus: "not_required", outcome: "blocked" };
  }

  // Clean and within every limit, but large enough that the operator
  // asked to see it regardless.
  if (verdict.needsApproval && !diff.needsHuman) {
    pendingStore.set(decl.id, {
      id: decl.id, scenario, declaration: decl, vault: run.session.vault,
      dryRun: dryRunResult, diff, intercepta, status: "awaiting_human", createdAt: Date.now(),
    });
    return { ...base, guardrailBreaches: [], worldStatus: "pending", outcome: "awaiting_human" };
  }

  if (!diff.needsHuman) {
    // Clean diff, allow-listed recipient — the auto path.
    let proofObjectId: string;
    let txDigest: string;

    if (isMintConfigured()) {
      const onChainDecl = await mintDeclarationOnChain(decl);
      const attestation = await attestMatch({ declarationId: onChainDecl.declarationObjectId, effectsDigest: diff.effectsDigest });
      const minted = await mintMatchProofOnChain({
        declarationId: onChainDecl.declarationObjectId,
        effectsDigest: diff.effectsDigest,
        attestation,
      });
      proofObjectId = minted.proofObjectId;
      const executed = await executeDeclaredOnChain({
        declaration: decl,
        declarationObjectId: onChainDecl.declarationObjectId,
        matchProofId: minted.proofObjectId,
      });
      txDigest = executed.digest;
    } else {
      proofObjectId = digestBytes(new TextEncoder().encode("match:" + decl.id));
      txDigest = digestBytes(new TextEncoder().encode("tx:" + decl.id));
    }

    return { ...base, guardrailBreaches: [], worldStatus: "not_required", outcome: "auto_executed", proofObjectId, txDigest };
  }

  // Needs a human: park it and tell the caller to send the owner through World.
  pendingStore.set(decl.id, {
    id: decl.id,
    scenario,
    declaration: decl,
    vault: run.session.vault,
    dryRun: dryRunResult,
    diff,
    intercepta,
    status: "awaiting_human",
    createdAt: Date.now(),
  });

  return { ...base, guardrailBreaches: [], worldStatus: "pending", outcome: "awaiting_human" };
}
