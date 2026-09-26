import { NextRequest, NextResponse } from "next/server";
import { validateAgentCallback } from "@/lib/world";
import { completeOverride } from "@/lib/override";

/**
 * The World ID for Agents redirect target. BIND_PRD.md §8.2: "The callback
 * is handled server-side only — this is a hard requirement from World's
 * track, not just good practice: the frontend never receives anything it
 * could forge a 'verified' result from." Everything here runs on the
 * server; the browser is only ever handed a redirect back to the app with
 * a status query param, never a credential.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? undefined;
  const sandbox = url.searchParams.get("sandbox");
  const appUrl = new URL("/app", url.origin);

  if (!state) {
    appUrl.searchParams.set("world_error", "missing_state");
    return NextResponse.redirect(appUrl);
  }

  // Sandbox mode never claims a decision here — it redirects the browser
  // back to the app to click an explicit approve/deny, which posts to
  // /api/override. This route's live branch below is what a real World
  // deployment would hit directly.
  if (sandbox) {
    appUrl.searchParams.set("declaration", state);
    appUrl.searchParams.set("world_sandbox", "1");
    return NextResponse.redirect(appUrl);
  }

  const validated = await validateAgentCallback({ code, state });
  if (!validated.approved) {
    appUrl.searchParams.set("declaration", state);
    appUrl.searchParams.set("world_status", "denied");
    return NextResponse.redirect(appUrl);
  }

  const outcome = await completeOverride(state, "approve", validated.nullifierHash);
  appUrl.searchParams.set("declaration", state);
  appUrl.searchParams.set("world_status", outcome.status);
  return NextResponse.redirect(appUrl);
}
