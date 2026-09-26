import { NextRequest, NextResponse } from "next/server";
import {
  walletState,
  signInOperator,
  verifyOperator,
  markVaultReady,
  hireAgent,
  completeOnboarding,
} from "@/lib/wallet-store";
import { validateAgentCallback } from "@/lib/world";
import { suiToMist } from "@/lib/amount";
import { toJsonSafe } from "@/lib/json";

/**
 * Drives the onboarding wizard one step at a time. Each step is a real
 * state change on the server, not a page the client advances by itself —
 * the wallet only considers you onboarded once the steps actually
 * happened, in order.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { step } = body as { step?: string };

  try {
    switch (step) {
      case "signin": {
        const { address, handle } = body as { address?: string; handle?: string };
        if (!address || !/^0x[0-9a-fA-F]{6,66}$/.test(address)) {
          return NextResponse.json({ error: "a valid Sui address is required" }, { status: 400 });
        }
        signInOperator(address, handle);
        break;
      }

      case "verify": {
        // Same server-side-only discipline as every other World gate here:
        // the client asks for a verification, it never asserts one.
        const { worldDecision } = body as { worldDecision?: "approve" | "deny" };
        const result = await validateAgentCallback({ state: "onboarding", sandboxDecision: worldDecision });
        if (!result.approved) {
          return NextResponse.json(
            toJsonSafe({ ok: false, reason: "World verification was not completed.", state: walletState() })
          );
        }
        verifyOperator(result.nullifierHash);
        break;
      }

      case "vault": {
        markVaultReady();
        break;
      }

      case "agent": {
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
        hireAgent({
          name: name.trim(),
          role: role?.trim() || "General purpose",
          envelopeLabel: envelopeLabel?.trim() || "Working budget",
          startingMist: suiToMist(startingSui ?? 0.2).toString(),
          perTxCapMist: suiToMist(perTxCapSui ?? 0.05).toString(),
        });
        completeOnboarding();
        break;
      }

      default:
        return NextResponse.json({ error: `unknown step: ${step}` }, { status: 400 });
    }

    return NextResponse.json(toJsonSafe({ ok: true, state: walletState() }));
  } catch (err) {
    console.error("[bind] /api/wallet/onboarding failed", err);
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
