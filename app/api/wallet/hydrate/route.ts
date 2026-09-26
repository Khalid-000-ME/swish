import { NextRequest, NextResponse } from "next/server";
import { replaceWalletState } from "@/lib/wallet-store";
import { toJsonSafe } from "@/lib/json";

/**
 * Restores a wallet snapshot the browser kept in localStorage.
 *
 * The server holds working state in memory, which dies with the process.
 * Rather than stand up a database for a single-operator wallet, the
 * browser keeps the last snapshot and hands it back on load — so your
 * agents, their history and their allow-lists survive a restart.
 *
 * Deliberately only accepts a snapshot when the server has nothing yet:
 * a page that has been open a while must not be able to stomp newer
 * state written by another tab.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { state } = body as { state?: unknown };

  if (!state || typeof state !== "object") {
    return NextResponse.json({ error: "a wallet snapshot is required" }, { status: 400 });
  }

  try {
    const result = replaceWalletState(state as Parameters<typeof replaceWalletState>[0]);
    return NextResponse.json(toJsonSafe(result));
  } catch (err) {
    console.error("[swish] /api/wallet/hydrate failed", err);
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
