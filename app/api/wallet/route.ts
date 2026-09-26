import { NextResponse } from "next/server";
import {
  walletState,
  caughtQueue,
  approvalQueue,
  totalHoldingsMist,
  refreshAgentBalances,
  stripSecrets,
} from "@/lib/wallet-store";
import { TASKS } from "@/lib/tasks";
import { toJsonSafe } from "@/lib/json";
import { executorAddress, isMintConfigured } from "@/lib/mint";
import { recallVerification } from "@/lib/world-memory";

export async function GET() {
  // Agent addresses are real, so their balances are read from chain
  // rather than remembered.
  await refreshAgentBalances();

  const state = stripSecrets(walletState());
  const holdings = totalHoldingsMist();

  return NextResponse.json(
    toJsonSafe({
      ...state,
      holdings,
      caught: caughtQueue(),
      approvals: approvalQueue(),
      tasks: TASKS,
      chainLive: isMintConfigured(),
      worldSandbox: !process.env.WORLD_CLIENT_ID,
      // A verification World already accepted, surviving resets. World
      // won't issue a second one for the same action, so onboarding needs
      // to know when asking again would be asking for the impossible.
      worldKnownHuman: recallVerification(),
      // The address that owns the vault and pays for owner operations,
      // which is not the sign-in identity. Money leaving the vault lands
      // here, so the wallet has to be able to show it.
      ownerAddress: executorAddress(),
      // stripSecrets has already removed each server's auth header; this
      // just restates the shape the browser is typed against.
      mcpServers: state.mcpServers.map((s) => ({ ...s, hasAuth: false })),
    })
  );
}
