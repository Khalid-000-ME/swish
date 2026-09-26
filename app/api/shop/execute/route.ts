import { NextRequest, NextResponse } from "next/server";
import { fromBase64 } from "@mysten/sui/utils";
import { suiClient } from "@/lib/sui";
import { toJsonSafe } from "@/lib/json";

/**
 * The demo shop's own broadcaster.
 *
 * A dApp gets `{ bytes, signature }` back from whatever wallet the
 * shopper connected, and then has to put it on chain itself. dapp-kit
 * would normally do that in the browser through its JSON-RPC client,
 * which the public fullnode no longer serves (see lib/sui.ts) — so the
 * shop submits from its own backend over gRPC instead.
 *
 * This knows nothing about Swish. It takes a signed transaction from any
 * Sui wallet and broadcasts it.
 */
export async function POST(req: NextRequest) {
  const { bytes, signature } = (await req.json().catch(() => ({}))) as {
    bytes?: string;
    signature?: string;
  };

  if (!bytes || !signature) {
    return NextResponse.json({ error: "bytes and signature are required" }, { status: 400 });
  }

  try {
    const result = await suiClient().executeTransaction({
      transaction: fromBase64(bytes),
      signatures: [signature],
      include: { effects: true },
    });

    if (result.$kind === "FailedTransaction") {
      return NextResponse.json(
        toJsonSafe({ error: "The transaction failed on chain.", status: result.FailedTransaction.status }),
        { status: 422 }
      );
    }

    return NextResponse.json(toJsonSafe({ digest: result.Transaction.digest }));
  } catch (err) {
    console.error("[shop] broadcast failed", err);
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 502 });
  }
}
