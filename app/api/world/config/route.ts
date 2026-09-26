import { NextResponse } from "next/server";
import { signRequest } from "@worldcoin/idkit-core/signing";

/**
 * Builds the config the IDKit widget needs to open a *real* World ID
 * request, including the `rp_context` — which is signed here, server-side,
 * because it has to be: World ID enforces RP signatures for 4.0 requests
 * and the signing key can never reach a browser.
 *
 * When the World credentials aren't configured this says so plainly, and
 * the UI shows a clearly-labelled simulation instead of a button that
 * claims to verify and doesn't.
 *
 * From the Developer Portal (developer.world.org), an app in `external`
 * mode — not `mini-app`, that's fixed at create time:
 *   WORLD_APP_ID        app_...
 *   WORLD_RP_ID         rp_...
 *   WORLD_ACTION        the action id you created
 *   WORLD_RP_SIGNING_KEY  signing_key.private_key — shown exactly once
 *   WORLD_ENVIRONMENT   "staging" for the simulator, "production" for real devices
 */
export async function GET(req: Request) {
  // A signature carries a single-use nonce, so signing is opt-in: the UI
  // probes for configuration on mount (no nonce burned) and asks for a
  // fresh signature only when the widget is actually about to open.
  // Reusing one is what World rejects as `duplicate_nonce`.
  const sign = new URL(req.url).searchParams.get("sign") === "1";
  const appId = process.env.WORLD_APP_ID;
  const rpId = process.env.WORLD_RP_ID;
  const action = process.env.WORLD_ACTION;
  // Accept either name — the Portal calls it signing_key.private_key, and
  // both spellings show up in people's .env files.
  const signingKeyHex = process.env.WORLD_RP_SIGNING_KEY ?? process.env.WORLD_RP_PRIVATE_KEY;
  const environment = process.env.WORLD_ENVIRONMENT === "staging" ? "staging" : "production";

  const missing = [
    !appId && "WORLD_APP_ID",
    !rpId && "WORLD_RP_ID",
    !action && "WORLD_ACTION",
    !signingKeyHex && "WORLD_RP_SIGNING_KEY (or WORLD_RP_PRIVATE_KEY)",
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    return NextResponse.json({ configured: false, missing });
  }

  if (!sign) {
    return NextResponse.json({ configured: true, app_id: appId, action, environment });
  }

  try {
    // signRequest produces the exact message layout World ID expects
    // (version || nonce || createdAt || expiresAt || action). Hand-rolling
    // this with a generic ECDSA sign does not work — it's a specific
    // 49/81-byte preimage, not a free-form string.
    const sig = signRequest({ signingKeyHex: signingKeyHex!, action: action! });

    return NextResponse.json({
      configured: true,
      app_id: appId,
      action,
      environment,
      rp_context: {
        rp_id: rpId,
        nonce: sig.nonce,
        created_at: sig.createdAt,
        expires_at: sig.expiresAt,
        signature: sig.sig,
      },
    });
  } catch (err) {
    console.error("[bind] failed to sign World rp_context", err);
    return NextResponse.json({
      configured: false,
      missing: ["WORLD_RP_SIGNING_KEY (rejected by signRequest — check it's the raw hex private key)"],
    });
  }
}
