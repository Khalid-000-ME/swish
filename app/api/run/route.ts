import { NextRequest, NextResponse } from "next/server";
import { runScenario } from "@/lib/pipeline";
import type { ScenarioId } from "@/lib/types";
import { buildAgentVerificationUrl } from "@/lib/world";
import { toJsonSafe } from "@/lib/json";

const VALID: ScenarioId[] = [
  "happy_path",
  "villain_hidden_effects",
  "villain_flagged_recipient",
  "villain_escalation",
  "override_denied",
];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const scenario = body.scenario as ScenarioId;

  if (!VALID.includes(scenario)) {
    return NextResponse.json({ error: `unknown scenario: ${scenario}` }, { status: 400 });
  }

  try {
    const result = await runScenario(scenario);

    let worldAuthorizeUrl: string | null = null;
    if (result.outcome === "awaiting_human") {
      worldAuthorizeUrl = buildAgentVerificationUrl({
        state: result.declaration.id,
        redirectUri: new URL("/api/world/callback", req.url).toString(),
      });
    }

    return NextResponse.json(toJsonSafe({ ...result, worldAuthorizeUrl }));
  } catch (err) {
    console.error("[bind] /api/run failed", err);
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
