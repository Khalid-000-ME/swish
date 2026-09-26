import { NextRequest, NextResponse } from "next/server";
import { getFaucetHost, requestSuiFromFaucetV2 } from "@mysten/sui/faucet";
import { findAgent, findSubAccount, refreshAgentBalances } from "@/lib/wallet-store";
import { fundAgentAddress, fundAgentFromVault, isMintConfigured } from "@/lib/mint";
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
  const { agentId, subAccountId, amountSui, source } = body as {
    agentId?: string;
    subAccountId?: string;
    amountSui?: number;
    source?: "operator" | "faucet" | "vault";
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

  const viaFaucet = source === "faucet" || (!isMintConfigured() && source !== "vault");

  try {
    // Straight out of the envelope the operator already set aside. This is
    // the owner spending their own budget — `owner_withdraw` is owner-only
    // and never touches the agent's cap, window or allow-list.
    if (source === "vault") {
      const sub = subAccountId ? findSubAccount(agentId, subAccountId) : agent.subAccounts[0];
      if (!sub) return NextResponse.json({ error: "no such envelope" }, { status: 404 });

      if (!isMintConfigured() || !sub.onChain || !sub.vaultObjectId) {
        return NextResponse.json(
          {
            error:
              "This envelope isn't a published vault, so there's nothing on chain to withdraw from. Use your own key instead.",
          },
          { status: 409 }
        );
      }

      const want = suiToMist(amountSui ?? 0.2);
      if (want > BigInt(sub.balanceMist)) {
        return NextResponse.json(
          {
            error: `${sub.label} holds ${Number(sub.balanceMist) / 1e9} SUI — not enough for ${amountSui ?? 0.2}.`,
          },
          { status: 409 }
        );
      }

      const { digest } = await fundAgentFromVault({
        vaultObjectId: sub.vaultObjectId,
        recipient: agent.address,
        amountMist: want,
      });

      // The envelope's own figure has to follow the chain, or the wallet
      // would keep showing money that has already left.
      sub.balanceMist = (BigInt(sub.balanceMist) - want).toString();
      await refreshAgentBalances();

      return NextResponse.json(
        toJsonSafe({
          via: "vault",
          address: agent.address,
          digest,
          fromEnvelope: sub.label,
          balanceMist: findAgent(agentId)?.addressBalanceMist ?? "0",
        })
      );
    }

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
    console.error("[swish] funding failed", err);
    return NextResponse.json(
      {
        error: viaFaucet
          ? `The testnet faucet turned this down: ${message}. It rate-limits per address and per IP, so waiting a few minutes usually clears it.`
          : source === "vault"
            ? `The vault refused the withdrawal: ${message}. If this mentions an unknown function, the package predates owner_withdraw — run scripts/upgrade.sh.`
            : `Could not send from your own key: ${message}`,
        address: agent.address,
      },
      { status: 502 }
    );
  }
}
