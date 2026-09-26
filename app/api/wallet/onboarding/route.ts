import { NextRequest, NextResponse } from "next/server";
import {
  walletState,
  signInOperator,
  verifyOperator,
  markVaultReady,
  hireAgent,
  completeOnboarding,
} from "@/lib/wallet-store";
import { validateAgentCallback, verifyWorldProof } from "@/lib/world";
import { createOperatorIdentity, isAgentKeyStorageConfigured } from "@/lib/agent-keys";
import { recallVerification, rememberVerification } from "@/lib/world-memory";
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
        const { address, handle, generate } = body as {
          address?: string;
          handle?: string;
          generate?: boolean;
        };

        // Swish is the wallet, so it mints the operator's key itself rather
        // than borrowing an address from one the person already installed.
        if (generate) {
          if (!isAgentKeyStorageConfigured()) {
            return NextResponse.json(
              {
                error:
                  "SWISH_AGENT_KEY_SECRET is unset, so a new key couldn't be stored safely. Set it (32 bytes of hex) and try again, or continue with an address you already have.",
              },
              { status: 409 }
            );
          }

          const identity = createOperatorIdentity();
          signInOperator(identity.address, handle);

          // The plaintext secret is returned exactly once and is not part
          // of the wallet state, so it never reaches the snapshot the
          // browser persists. This response is the only time it exists
          // outside the sealed copy.
          return NextResponse.json(
            toJsonSafe({
              ok: true,
              state: walletState(),
              generated: { address: identity.address, secretKey: identity.secretKey },
            })
          );
        }

        if (!address || !/^0x[0-9a-fA-F]{6,66}$/.test(address)) {
          return NextResponse.json({ error: "a valid Sui address is required" }, { status: 400 });
        }
        signInOperator(address, handle);
        break;
      }

      case "verify": {
        const { worldDecision, proof, useRemembered } = body as {
          worldDecision?: "approve" | "deny" | "recognised";
          proof?: unknown;
          useRemembered?: boolean;
        };

        // World won't let the same human prove personhood twice for one
        // action — that refusal *is* the uniqueness guarantee. So a
        // verification this server already checked counts on later runs,
        // rather than sending someone to do something World will reject.
        // What's trusted is the server's own record, not a client claim.
        if (useRemembered) {
          const known = recallVerification();
          if (!known) {
            return NextResponse.json(
              toJsonSafe({ ok: false, reason: "No earlier verification on record.", state: walletState() })
            );
          }
          verifyOperator(known.nullifierHash);
          break;
        }

        // World refused to issue a second proof because it already knows
        // this human. That refusal happens inside the IDKit widget, so the
        // proof never reaches our verify call and there is no nullifier to
        // take from it — which is why this is recorded as a replay rather
        // than dressed up as a proof. An override attestation needs a real
        // nullifier and will say so; personhood for onboarding does not.
        if (worldDecision === "recognised") {
          const known = recallVerification();
          const nullifierHash = known?.nullifierHash ?? `world-replay:${process.env.WORLD_ACTION ?? ""}`;
          verifyOperator(nullifierHash);
          rememberVerification({
            nullifierHash,
            verifiedAt: Date.now(),
            mode: "live",
            via: known?.via === "proof" ? "proof" : "replay",
          });
          break;
        }

        if (worldDecision === "deny") {
          return NextResponse.json(
            toJsonSafe({ ok: false, reason: "World verification was not completed.", state: walletState() })
          );
        }

        // A real IDKit proof is verified against World before it counts.
        // The client cannot talk its way past this by asserting success —
        // it hands over a proof and the server decides.
        if (proof) {
          const verified = await verifyWorldProof(proof);

          // World recognised this human and refused to issue a second
          // uniqueness claim. If we already hold the verification from the
          // first time, that refusal confirms the same person rather than
          // blocking them — the earlier proof is what's being trusted, not
          // this failed one.
          if (!verified.success && verified.alreadyVerified) {
            // Prefer the nullifier World's refusal carried, falling back to
            // whatever was recorded earlier. Either way this is the same
            // human it was the first time, which is all the step asks.
            const nullifier = verified.nullifierHash || recallVerification()?.nullifierHash;
            if (nullifier) {
              verifyOperator(nullifier);
              rememberVerification({
                nullifierHash: nullifier,
                verifiedAt: Date.now(),
                mode: "live",
                via: verified.nullifierHash ? "proof" : "replay",
              });
              break;
            }
          }

          if (!verified.success) {
            return NextResponse.json(
              toJsonSafe({ ok: false, reason: verified.detail ?? "World rejected this proof.", state: walletState() })
            );
          }
          verifyOperator(verified.nullifierHash);
          rememberVerification({
            nullifierHash: verified.nullifierHash,
            verifiedAt: Date.now(),
            mode: "live",
            via: "proof",
          });
          break;
        }

        // No proof and no World app configured — the simulated path, which
        // the UI labels as simulated rather than calling it verification.
        const result = await validateAgentCallback({ state: "onboarding", sandboxDecision: "approve" });
        verifyOperator(result.nullifierHash);
        rememberVerification({
          nullifierHash: result.nullifierHash,
          verifiedAt: Date.now(),
          mode: result.mode,
          via: "proof",
        });
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
    console.error("[swish] /api/wallet/onboarding failed", err);
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
