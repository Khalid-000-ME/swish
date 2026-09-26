import { NextRequest, NextResponse } from "next/server";
import { createRequest, normalizeOrigin, resolveConnection } from "@/lib/connections";
import { toJsonSafe } from "@/lib/json";

/**
 * A site asks to connect. This is the public entry point — the wallet
 * equivalent of `eth_requestAccounts`, except what gets granted is a
 * bounded agent rather than an account.
 *
 * Nothing here decides anything: it opens a request the operator has to
 * approve in their own wallet UI, and hands back an id the site can poll.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { origin: claimed, reason } = body as { origin?: string; reason?: string };

  // Prefer the browser-set Origin header over anything in the body; a
  // site naming itself is a claim, the header is at least the browser's.
  const origin = normalizeOrigin(req.headers.get("origin") ?? claimed ?? "");
  if (!origin) {
    return NextResponse.json({ error: "a valid origin is required" }, { status: 400 });
  }

  const request = createRequest(origin, reason);
  return NextResponse.json(
    toJsonSafe({
      requestId: request.id,
      status: request.status,
      // Where to send the human to approve it.
      approveUrl: new URL(`/connect?request=${request.id}`, req.url).toString(),
    })
  );
}

/** Polls a request, or checks whether a token is still good. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? req.headers.get("authorization")?.replace(/^Bearer /i, "");

  if (token) {
    const resolved = resolveConnection(token, req.headers.get("origin"));
    return NextResponse.json(
      resolved.ok
        ? toJsonSafe({
            valid: true,
            agentId: resolved.connection.agentId,
            expiresAt: resolved.connection.expiresAt,
            actionsRemaining: resolved.connection.maxActions - resolved.connection.actionsUsed,
          })
        : { valid: false, reason: resolved.reason }
    );
  }

  const requestId = url.searchParams.get("request");
  if (!requestId) return NextResponse.json({ error: "request or token is required" }, { status: 400 });

  const { getRequest } = await import("@/lib/connections");
  const request = getRequest(requestId);
  if (!request) return NextResponse.json({ error: "no such request" }, { status: 404 });

  // The token is handed over exactly once, when the site first sees that
  // its request was approved.
  if (request.status === "approved" && request.connectionId) {
    const { listConnections } = await import("@/lib/connections");
    const connection = listConnections().find((c) => c.id === request.connectionId);
    return NextResponse.json(
      toJsonSafe({
        status: "approved",
        token: connection?.token,
        agentId: connection?.agentId,
        expiresAt: connection?.expiresAt,
        maxActions: connection?.maxActions,
      })
    );
  }

  return NextResponse.json(toJsonSafe({ status: request.status }));
}
