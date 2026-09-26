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
import { isMintConfigured } from "@/lib/mint";

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
    })
  );
}
