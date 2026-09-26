import { NextRequest, NextResponse } from "next/server";
import { findAgent } from "@/lib/wallet-store";
import { toJsonSafe } from "@/lib/json";
import { BRIEF_MAX_CHARS } from "@/lib/agent-brief";

/**
 * The operator's kill switch. Freezing an agent is the wallet-level
 * mirror of `freeze_vault` in allowance_vault.move — owner-only, and
 * checked before anything can leave. Nothing an agent does, and nothing
 * anyone sends it, can undo this.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { agentId, status } = body as { agentId?: string; status?: "active" | "paused" | "frozen" };

  if (!agentId || !status) {
    return NextResponse.json({ error: "agentId and status are required" }, { status: 400 });
  }

  const agent = findAgent(agentId);
  if (!agent) return NextResponse.json({ error: "no such agent" }, { status: 404 });

  agent.status = status;
  return NextResponse.json(toJsonSafe({ agent }));
}

/**
 * Editing an agent's brief.
 *
 * The brief is the only part of an agent written in prose, and it's real:
 * it goes to the model as instructions before every run. It is not a
 * guardrail, and this endpoint doesn't pretend otherwise — nothing written
 * here can raise a cap or clear a counterparty, because those live in the
 * vault and are checked after the model has had its say.
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { agentId, brief } = body as { agentId?: string; brief?: string };

  if (!agentId) return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  if (typeof brief !== "string") {
    return NextResponse.json({ error: "brief must be a string" }, { status: 400 });
  }
  if (brief.length > BRIEF_MAX_CHARS) {
    return NextResponse.json(
      { error: `A brief has to fit in ${BRIEF_MAX_CHARS} characters — this one is ${brief.length}.` },
      { status: 400 }
    );
  }

  const agent = findAgent(agentId);
  if (!agent) return NextResponse.json({ error: "no such agent" }, { status: 404 });

  agent.brief = brief;
  return NextResponse.json(toJsonSafe({ agentId, savedAt: Date.now(), chars: brief.length }));
}
