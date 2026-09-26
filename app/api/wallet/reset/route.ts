import { NextResponse } from "next/server";
import { resetWalletState, walletState } from "@/lib/wallet-store";

/**
 * Starting over.
 *
 * Onboarding runs once and there was no way back: the server refuses to
 * re-onboard while it holds a wallet, and the browser hands that same
 * wallet straight back after a restart. So an agent that had become
 * unusable was permanent, and the only escape was clearing site data by
 * hand — which is not a thing to ask of anyone.
 *
 * This wipes the server's copy and tells the browser to drop its own. It
 * does not touch the chain: the vault, its allow-list and every past
 * transaction stay exactly where they are, and any SUI already sent to an
 * old agent's address stays there. Only this wallet's view of things
 * goes.
 */
export async function POST() {
  const before = walletState();
  const summary = {
    agents: before.agents.map((a) => ({ name: a.name, address: a.address })),
    activity: before.activity.length,
  };

  resetWalletState();

  return NextResponse.json({
    reset: true,
    // Handed back so the UI can say what was let go of, rather than
    // quietly emptying the screen.
    discarded: summary,
    note: "Nothing on chain was touched. SUI sent to the old agent addresses is still there, and their keys are still in the server's keystore.",
  });
}
