import { NextRequest, NextResponse } from "next/server";
import { approveRequest, listConnections, pendingRequests, rejectRequest, revokeConnection } from "@/lib/connections";
import { findSubAccount } from "@/lib/wallet-store";
import { guardrailsFor } from "@/lib/guardrails";
import { suiToMist } from "@/lib/amount";
import { toJsonSafe } from "@/lib/json";

export async function GET() {
  return NextResponse.json(
    toJsonSafe({
      pending: pendingRequests(),
      // The token is the credential — it never goes back to the operator's
      // own UI, which has no use for it.
      connections: listConnections().map((c) => {
        const safe = { ...c } as Partial<typeof c>;
        delete safe.token;
        return safe;
      }),
    })
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { action } = body as { action?: string };

  try {
    if (action === "approve") {
      const { requestId, agentId, subAccountId, perTxCapSui, ttlMinutes, maxActions } = body as {
        requestId?: string;
        agentId?: string;
        subAccountId?: string;
        perTxCapSui?: number;
        ttlMinutes?: number;
        maxActions?: number;
      };
      if (!requestId || !agentId || !subAccountId) {
        return NextResponse.json({ error: "requestId, agentId and subAccountId are required" }, { status: 400 });
      }

      const sub = findSubAccount(agentId, subAccountId);
      if (!sub) return NextResponse.json({ error: "no such envelope" }, { status: 404 });

      // A connection can only ever be tighter than the envelope it draws
      // on — granting a site more than the envelope itself allows would
      // make the envelope's limits meaningless.
      const envelope = guardrailsFor(sub);
      const requested = perTxCapSui !== undefined ? suiToMist(perTxCapSui) : BigInt(envelope.perTxCapMist);
      const perTxCapMist = requested < BigInt(envelope.perTxCapMist) ? requested : BigInt(envelope.perTxCapMist);

      const connection = approveRequest({
        requestId,
        agentId,
        subAccountId,
        guardrails: { ...envelope, perTxCapMist: perTxCapMist.toString() },
        ttlMs: Math.max(1, ttlMinutes ?? 60) * 60_000,
        maxActions: Math.max(1, maxActions ?? 25),
      });

      if (!connection) return NextResponse.json({ error: "request is no longer pending" }, { status: 409 });
      const safe = { ...connection } as Partial<typeof connection>;
      delete safe.token;
      return NextResponse.json(toJsonSafe({ connection: safe }));
    }

    if (action === "reject") {
      const { requestId } = body as { requestId?: string };
      if (!requestId) return NextResponse.json({ error: "requestId is required" }, { status: 400 });
      return NextResponse.json({ rejected: rejectRequest(requestId) });
    }

    if (action === "revoke") {
      const { connectionId } = body as { connectionId?: string };
      if (!connectionId) return NextResponse.json({ error: "connectionId is required" }, { status: 400 });
      return NextResponse.json({ revoked: revokeConnection(connectionId) });
    }

    return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    console.error("[bind] /api/wallet/connections failed", err);
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
