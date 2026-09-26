import { NextRequest, NextResponse } from "next/server";
import { completeOverride } from "@/lib/override";

/**
 * Sandbox-mode override decision: the human's "approve/deny" click reaches
 * this route directly instead of going through a real World redirect, per
 * the track's own allowance ("Proofs are using fake identities"). It still
 * only ever completes server-side (completeOverride), same as the live
 * OIDC callback would — the frontend can request an outcome, it can never
 * hand the server a pre-made "verified" claim.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { declarationId, decision } = body as { declarationId?: string; decision?: "approve" | "deny" };

  if (!declarationId || (decision !== "approve" && decision !== "deny")) {
    return NextResponse.json({ error: "declarationId and decision are required" }, { status: 400 });
  }

  try {
    const outcome = await completeOverride(declarationId, decision, `0xsandbox-${declarationId}`);
    return NextResponse.json(outcome);
  } catch (err) {
    console.error("[bind] /api/override failed", err);
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
