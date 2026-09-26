import { runBindAgent, type AgentRunResult } from "@/agent";
import { diffEffects } from "./diff";
import { screenRecipient } from "./intercepta";
import { buildPtb, dryRun } from "./sui";
import { attestMatch, digestBytes } from "./attest";
import { mintDeclarationOnChain, mintMatchProofOnChain, executeDeclaredOnChain, isMintConfigured } from "./mint";
import { pendingStore } from "./store";
import { suiToMist } from "./amount";
import type { BuiltPtb } from "@/agent/tools";
import type { Declaration, DryRunResult, ExecutionEvent, ScenarioId } from "./types";
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
  interceptaSource: "live" | "mock";
  worldSandbox: boolean;
}

export async function runScenario(scenario: ScenarioId): Promise<ScenarioRunResult> {
  const run = await runBindAgent(scenario);
  const decl = run.outputs.declaration;
  const ptb = run.outputs.ptb;
  if (!decl || !ptb) {
    throw new Error("agent did not complete its declaration/build steps");
  }

  const { result: dryRunResult, source: dryRunSource } = await computeDryRun(run.session, decl, ptb);
  const diff = diffEffects(decl, dryRunResult, run.session.vault);
  const intercepta = await screenRecipient(decl.recipient);

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

  if (intercepta.flagged) {
    return { ...base, worldStatus: "not_required", outcome: "hard_blocked" };
  }

  if (diff.verdict === "violations") {
    return { ...base, worldStatus: "not_required", outcome: "blocked" };
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

    return { ...base, worldStatus: "not_required", outcome: "auto_executed", proofObjectId, txDigest };
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

  return { ...base, worldStatus: "pending", outcome: "awaiting_human" };
}
