import { NextResponse } from "next/server";
import { walletState, caughtQueue, approvalQueue } from "@/lib/wallet-store";
import { TASKS } from "@/lib/tasks";
import { toJsonSafe } from "@/lib/json";
import { isMintConfigured } from "@/lib/mint";

export async function GET() {
  const state = walletState();
  return NextResponse.json(
    toJsonSafe({
      ...state,
      caught: caughtQueue(),
      approvals: approvalQueue(),
      tasks: TASKS,
      chainLive: isMintConfigured(),
      worldSandbox: !process.env.WORLD_CLIENT_ID,
    })
  );
}
