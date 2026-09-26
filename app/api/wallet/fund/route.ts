import { NextRequest, NextResponse } from "next/server";
import { getFaucetHost, requestSuiFromFaucetV2 } from "@mysten/sui/faucet";
import { findAgent, refreshAgentBalances } from "@/lib/wallet-store";
import { fundAgentAddress, isMintConfigured } from "@/lib/mint";
import { suiToMist } from "@/lib/amount";
import { toJsonSafe } from "@/lib/json";

/**
 * Putting gas in an agent's pocket.
 *
 * An agent pays for its own transactions, so a brand-new one can't do
 * anything at all until its address holds SUI — and there was no way to
 * get any there except finding the address by hand and using a faucet in
 * another tab. That's a dead end the wallet created and should fix.
 *
 * Two sources, in the order that actually works. The operator's own key
 * already holds testnet SUI (it's what published the vault), so a
 * transfer from it is instant and predictable. The faucet is the fallback
 * for when that key is empty, and it's rate-limited per address and per
 * IP, so it is not something to lead with.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { agentId, amountSui, source } = body as {
    agentId?: string;
    amountSui?: number;
    source?: "operator" | "faucet";
  };

  if (!agentId) return NextResponse.json({ error: "agentId is required" }, { status: 400 });

  const agent = findAgent(agentId);
  if (!agent) return NextResponse.json({ error: "no such agent" }, { status: 404 });

  const want = amountSui ?? 0.2;
  if (!(want > 0) || want > 5) {
    return NextResponse.json(
      { error: "amountSui must be between 0 and 5 — this is testnet gas money, not a treasury transfer" },
      { status: 400 }
    );
  }

  const viaFaucet = source === "faucet" || !isMintConfigured();

  try {
    if (viaFaucet) {
      await requestSuiFromFaucetV2({ host: getFaucetHost("testnet"), recipient: agent.address });
      // The faucet is asynchronous: it accepts the request and the coin
      // lands a moment later, so the balance below may still read zero.
      await refreshAgentBalances();
      return NextResponse.json(
        toJsonSafe({
          via: "faucet",
          address: agent.address,
          note: "The faucet accepted the request. The coin usually lands within a few seconds.",
          balanceMist: findAgent(agentId)?.addressBalanceMist ?? "0",
        })
      );
    }

    const { digest } = await fundAgentAddress({ recipient: agent.address, amountMist: suiToMist(want) });
    await refreshAgentBalances();

    return NextResponse.json(
      toJsonSafe({
        via: "operator",
        address: agent.address,
        digest,
        balanceMist: findAgent(agentId)?.addressBalanceMist ?? "0",
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[bind] funding failed", err);
    return NextResponse.json(
      {
        error: viaFaucet
          ? `The testnet faucet turned this down: ${message}. It rate-limits per address and per IP, so waiting a few minutes usually clears it.`
          : `Could not send from your own key: ${message}`,
        address: agent.address,
      },
      { status: 502 }
    );
  }
}
