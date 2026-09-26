import { NextRequest, NextResponse } from "next/server";
import { findAgent } from "@/lib/wallet-store";
import { toJsonSafe } from "@/lib/json";

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
