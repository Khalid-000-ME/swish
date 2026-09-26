import { NextResponse } from "next/server";
import { randomBytes, createSign } from "node:crypto";

/**
 * Builds the config the IDKit widget needs to open a *real* World ID
 * request, including the `rp_context` — which is signed here, server-side,
 * because it has to be: it carries the relying party's ECDSA signature
 * over the nonce and timestamps, and that key can never reach a browser.
 *
 * When the World credentials aren't configured, this says so plainly
 * rather than handing back something that looks usable. The UI then shows
 * a clearly-labelled simulation instead of a button that says "Verify
 * with World ID" and quietly verifies nothing — which is what it used to
 * do, and was exactly the kind of thing this project exists to argue
 * against.
 *
 * To make this real you need, from the World Developer Portal:
 *   WORLD_APP_ID          app_...
 *   WORLD_ACTION          the action id you registered
 *   WORLD_RP_ID           your registered relying-party id
 *   WORLD_RP_PRIVATE_KEY  PEM-encoded EC private key for that RP
 */
export async function GET() {
  const appId = process.env.WORLD_APP_ID;
  const action = process.env.WORLD_ACTION;
  const rpId = process.env.WORLD_RP_ID;
  const rpKey = process.env.WORLD_RP_PRIVATE_KEY;

  const missing = [
    !appId && "WORLD_APP_ID",
    !action && "WORLD_ACTION",
    !rpId && "WORLD_RP_ID",
    !rpKey && "WORLD_RP_PRIVATE_KEY",
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    return NextResponse.json({ configured: false, missing });
  }

  try {
    const nonce = randomBytes(16).toString("hex");
    const createdAt = Math.floor(Date.now() / 1000);
    const expiresAt = createdAt + 300;

    const signer = createSign("SHA256");
    signer.update(`${nonce}.${createdAt}`);
    signer.end();
    const signature = signer.sign(rpKey!, "base64");

    return NextResponse.json({
      configured: true,
      app_id: appId,
      action,
      rp_context: { rp_id: rpId, nonce, created_at: createdAt, expires_at: expiresAt, signature },
    });
  } catch (err) {
    console.error("[bind] failed to build World rp_context", err);
    return NextResponse.json({ configured: false, missing: ["WORLD_RP_PRIVATE_KEY (unreadable)"] });
  }
}
