import { canonicalAttestMessage, nullifierHashBytes, signAttestation, type Attestation } from "./attest";

/**
 * World integration — two tracks (BIND_PRD.md §8):
 *   1. IDKit, gating vault creation (one verified human per vault).
 *   2. World ID for Agents, gating the override path. This is OIDC-shaped
 *      — a redirect, not the IDKit widget — and the callback is validated
 *      **server-side only**, per the track's hard requirement.
 *
 * Live mode activates when WORLD_APP_ID / WORLD_CLIENT_SECRET are set.
 * Sandbox mode (the default here) fabricates the same shapes with a
 * labelled fake identity, exactly as the track itself permits: "Proofs are
 * using fake identities, DO NOT rely on them for production."
 */

export interface IDKitVerifyInput {
  merkle_root: string;
  nullifier_hash: string;
  proof: string;
  verification_level: "orb" | "device";
  action: string;
  signal?: string;
}

export interface WorldVerifyResult {
  success: boolean;
  nullifierHash: string;
  mode: "live" | "sandbox";
  detail?: string;
}

export async function verifyIDKitProof(input: IDKitVerifyInput): Promise<WorldVerifyResult> {
  const appId = process.env.WORLD_APP_ID;

  if (appId) {
    try {
      const res = await fetch(`https://developer.worldcoin.org/api/v2/verify/${appId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nullifier_hash: input.nullifier_hash,
          merkle_root: input.merkle_root,
          proof: input.proof,
          verification_level: input.verification_level,
          action: input.action,
          signal: input.signal,
        }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      return { success: res.ok, nullifierHash: input.nullifier_hash, mode: "live", detail: data?.detail };
    } catch (e) {
      return { success: false, nullifierHash: input.nullifier_hash, mode: "live", detail: String(e) };
    }
  }

  // Sandbox: accept any proof that looks well-formed, so vault creation is
  // demoable without a live World app registered.
  const wellFormed = Boolean(input.nullifier_hash && input.merkle_root && input.proof);
  return { success: wellFormed, nullifierHash: input.nullifier_hash || "0xsandbox", mode: "sandbox" };
}

/** The redirect the owner is sent to for a fresh, per-declaration override. */
export function buildAgentVerificationUrl(params: { state: string; redirectUri: string }): string {
  const clientId = process.env.WORLD_CLIENT_ID;
  if (clientId) {
    const url = new URL("https://id.worldcoin.org/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("scope", "openid");
    url.searchParams.set("state", params.state);
    return url.toString();
  }
  // Sandbox redirect — our own callback route, simulating the OIDC round trip.
  const url = new URL(params.redirectUri);
  url.searchParams.set("sandbox", "1");
  url.searchParams.set("state", params.state);
  return url.toString();
}

export interface OverrideOutcome {
  approved: boolean;
  nullifierHash: string;
  mode: "live" | "sandbox";
}

/** Exchanges the OIDC `code` server-side. Never trust anything the frontend claims. */
export async function validateAgentCallback(params: {
  code?: string;
  state: string;
  sandboxDecision?: "approve" | "deny";
}): Promise<OverrideOutcome> {
  const clientId = process.env.WORLD_CLIENT_ID;
  const clientSecret = process.env.WORLD_CLIENT_SECRET;

  if (clientId && clientSecret && params.code) {
    const res = await fetch("https://id.worldcoin.org/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: params.code,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    const nullifierHash: string = data?.sub ?? data?.nullifier_hash ?? "";
    return { approved: res.ok && Boolean(nullifierHash), nullifierHash, mode: "live" };
  }

  // Sandbox: the human's decision came from our own demo UI, not a forgeable
  // frontend claim about verification — it still only ever reaches this
  // function server-side, same as the live path would.
  return {
    approved: params.sandboxDecision === "approve",
    nullifierHash: `0xsandbox-${params.state}`,
    mode: "sandbox",
  };
}

export interface OverrideAttestation {
  attestation: Attestation;
  verifiedAtMs: number;
  /** hex-encoded bytes — pass this exact vector<u8> as the nullifier_hash arg. */
  nullifierHashHex: string;
}

/**
 * Mint-ready attestation for an approved override (proofs.move
 * `mint_override_approval`). The Move call must be given the *same*
 * `verifiedAtMs` and nullifier-hash bytes used here, or the on-chain
 * `canonical_message` reconstruction won't match this signature and the
 * mint aborts on `E_BAD_SIG` — that mismatch is the point, not a bug.
 */
export async function attestOverride(input: {
  declarationId: string;
  effectsDigest: string;
  nullifierHash: string;
}): Promise<OverrideAttestation> {
  const verifiedAtMs = Date.now();
  const nullifierBytes = nullifierHashBytes(input.nullifierHash);
  const msg = canonicalAttestMessage({
    declarationId: input.declarationId,
    effectsDigest: input.effectsDigest,
    nullifierHash: nullifierBytes,
    timestampMs: verifiedAtMs,
  });
  return {
    attestation: await signAttestation(msg),
    verifiedAtMs,
    nullifierHashHex: Buffer.from(nullifierBytes).toString("hex"),
  };
}
