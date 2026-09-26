import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * What World has already told us about this operator.
 *
 * World ID's whole point is that a person can only verify once per
 * action. Verifying is therefore not repeatable, which collides with a
 * wallet that resets: the second run through onboarding hits
 * `nullifier_replayed` and dead-ends, because World is correctly refusing
 * to issue a second personhood proof to the same human.
 *
 * So the wallet remembers, outside its own resettable state. A
 * verification that actually happened — a proof this server checked
 * against World — is recorded here, and later runs recognise the operator
 * instead of asking them to prove something World won't let them prove
 * again.
 *
 * Only the nullifier hash is kept. That's a per-action pseudonym, not an
 * identity: it says "the same human as last time" and nothing else.
 */
export interface KnownHuman {
  nullifierHash: string;
  verifiedAt: number;
  /** "live" when World checked it, "sandbox" when nothing was configured. */
  mode: "live" | "sandbox";
  /**
   * How we came to know.
   *
   * "proof" is a proof this server verified and took a nullifier from.
   * "replay" is World refusing to issue a second one because it already
   * knows this human — which is the uniqueness guarantee working, but it
   * arrives without a nullifier when the refusal happens inside the IDKit
   * widget rather than at our verify call. The distinction is recorded
   * because an override attestation needs a real nullifier, and a replay
   * marker is not one.
   */
  via?: "proof" | "replay";
}

const STORE = resolve(process.env.SWISH_WORLD_MEMORY_PATH ?? ".swish-world.json");
/** Written under the old name before the project was renamed. */
const LEGACY_STORE = resolve(".bind-world.json");

export function rememberVerification(entry: KnownHuman): void {
  // A sandbox result must never overwrite a real one — that would let an
  // unconfigured run downgrade a verification that genuinely happened.
  const existing = recallVerification();
  if (existing?.mode === "live" && entry.mode === "sandbox") return;
  // A replay marker must never overwrite a real nullifier, for the same
  // reason: it would downgrade something we actually have.
  if (existing?.via === "proof" && entry.via === "replay") return;

  try {
    mkdirSync(dirname(STORE), { recursive: true });
    writeFileSync(STORE, JSON.stringify(entry, null, 2), { mode: 0o600 });
  } catch (err) {
    console.error("[swish] could not record the World verification", err);
  }
}

export function recallVerification(): KnownHuman | null {
  try {
    const path = existsSync(STORE) ? STORE : existsSync(LEGACY_STORE) ? LEGACY_STORE : null;
    if (!path) return null;
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<KnownHuman>;
    if (!parsed?.nullifierHash || !parsed.verifiedAt) return null;
    return {
      nullifierHash: parsed.nullifierHash,
      verifiedAt: parsed.verifiedAt,
      mode: parsed.mode === "live" ? "live" : "sandbox",
      via: parsed.via === "replay" ? "replay" : "proof",
    };
  } catch {
    return null;
  }
}
