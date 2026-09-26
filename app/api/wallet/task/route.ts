import { NextRequest, NextResponse } from "next/server";
import { runScenario } from "@/lib/pipeline";
import { findTask } from "@/lib/tasks";
import { findAgent, findSubAccount, recordOutcome, walletState, type ActivityItem } from "@/lib/wallet-store";
import { toJsonSafe } from "@/lib/json";
import { guardrailsFor } from "@/lib/guardrails";

/**
 * Give an agent a task. The agent runs its fixed tool sequence, the
 * declaration is diffed and screened, and whatever comes back lands in the
 * wallet's activity feed — auto-executed, parked for a human, or caught.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { agentId, subAccountId, taskId } = body as {
    agentId?: string;
    subAccountId?: string;
    taskId?: string;
  };

  const agent = agentId ? findAgent(agentId) : undefined;
  const sub = agentId && subAccountId ? findSubAccount(agentId, subAccountId) : undefined;
  const task = taskId ? findTask(taskId) : undefined;

  if (!agent || !sub || !task) {
    return NextResponse.json({ error: "agentId, subAccountId and taskId are required" }, { status: 400 });
  }
  if (agent.status === "frozen") {
    return NextResponse.json({ error: `${agent.name} is frozen — unfreeze it first` }, { status: 409 });
  }

  try {
    const state = walletState();
    const result = await runScenario(task.scenario, {
      allowlist: sub.allowlist.map((a) => a.address),
      perTxCapMist: BigInt(sub.perTxCapMist),
      guardrails: guardrailsFor(sub),
      history: state.activity.filter((a) => a.subAccountId === sub.id),
    });

    // An address the operator has banned is never payable again, whatever
    // the agent declares and whatever the screen says this time.
    const banned = state.bannedAddresses.some(
      (b) => b.address.toLowerCase() === result.declaration.recipient.toLowerCase()
    );
    const outcome: ActivityItem["outcome"] = banned ? "hard_blocked" : result.outcome;
    const screened = result.intercepta ?? {
      address: result.declaration.recipient,
      flagged: false,
      riskScore: 0,
      source: "mock" as const,
    };

    const item: ActivityItem = {
      id: result.declaration.id,
      agentId: agent.id,
      subAccountId: sub.id,
      ts: Date.now(),
      task: task.label,
      scenario: task.scenario,
      recipient: result.declaration.recipient,
      amountMist: result.declaration.maxAmount.toString(),
      reason: result.declaration.reason,
      outcome,
      diff: result.diff,
      dryRun: result.dryRun,
      intercepta: banned
        ? { ...screened, flagged: true, reason: "Address is on this wallet's ban list." }
        : screened,
      dryRunSource: result.dryRunSource,
      agentMode: result.agent.mode,
      narration: result.agent.narration,
      steps: result.agent.steps,
      txDigest: result.txDigest,
      proofObjectId: result.proofObjectId,
      reviewed: false,
      guardrailBreaches: result.guardrailBreaches,
    };

    state.activity.unshift(item);
    recordOutcome(agent, outcome);

    if (outcome === "auto_executed") {
      const spent = BigInt(item.amountMist);
      sub.balanceMist = (BigInt(sub.balanceMist) - spent).toString();
      sub.windowSpentMist = (BigInt(sub.windowSpentMist) + spent).toString();
      const entry = sub.allowlist.find((a) => a.address === item.recipient);
      if (entry) {
        entry.lastPaidAt = Date.now();
        entry.totalPaidMist = (BigInt(entry.totalPaidMist) + spent).toString();
      }
    }

    return NextResponse.json(toJsonSafe({ item }));
  } catch (err) {
    console.error("[bind] /api/wallet/task failed", err);
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
