import { NextRequest, NextResponse } from "next/server";
import { hireAgent, walletState } from "@/lib/wallet-store";
import { isAgentKeyStorageConfigured } from "@/lib/agent-keys";
import { suiToMist } from "@/lib/amount";
import { toJsonSafe } from "@/lib/json";

/**
 * Hiring an agent after setup is done.
 *
 * The onboarding wizard could hire the first one and nothing could hire a
 * second: /onboarding shows the credentials screen once it has run, so the
 * wallet's own "Hire" button was a dead end. This is the same `hireAgent`
 * the wizard's last step calls, without the steps around it — no sign-in,
 * no World verification, no `completeOnboarding()`, because all three have
 * already happened and re-running the last one would rewrite the
 * credentials screen with a new agent's details.
 *
 * Only the first agent gets the published vault. Every one after it gets a
 * local envelope, which the wallet labels as such rather than implying it
 * is on chain.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { name, role, envelopeLabel, startingSui, perTxCapSui } = body as {
    name?: string;
    role?: string;
    envelopeLabel?: string;
    startingSui?: number;
    perTxCapSui?: number;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "your agent needs a name" }, { status: 400 });
  }

  if (!walletState().onboarding.complete) {
    return NextResponse.json(
      { error: "finish setting up the wallet first — /onboarding" },
      { status: 409 }
    );
  }

  // Minting an identity we can't seal would produce an agent that can
  // receive and never spend, which is worth refusing rather than shipping.
  if (!isAgentKeyStorageConfigured()) {
    return NextResponse.json(
      {
        error:
          "SWISH_AGENT_KEY_SECRET is unset, so a new agent's key couldn't be stored safely. Set it (32 bytes of hex) and try again.",
      },
      { status: 409 }
    );
  }

  const cap = perTxCapSui ?? 0.05;
  if (!(cap > 0)) {
    return NextResponse.json({ error: "the per-payment cap has to be above zero" }, { status: 400 });
  }

  const agent = hireAgent({
    name: name.trim(),
    role: role?.trim() || "General purpose",
    envelopeLabel: envelopeLabel?.trim() || "Working budget",
    startingMist: suiToMist(startingSui ?? 0).toString(),
    perTxCapMist: suiToMist(cap).toString(),
  });

  return NextResponse.json(
    toJsonSafe({ agentId: agent.id, address: agent.address, signable: agent.signable })
  );
}
