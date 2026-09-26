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
}

const STORE = resolve(process.env.BIND_WORLD_MEMORY_PATH ?? ".bind-world.json");

export function rememberVerification(entry: KnownHuman): void {
  // A sandbox result must never overwrite a real one — that would let an
  // unconfigured run downgrade a verification that genuinely happened.
  const existing = recallVerification();
  if (existing?.mode === "live" && entry.mode === "sandbox") return;

  try {
    mkdirSync(dirname(STORE), { recursive: true });
    writeFileSync(STORE, JSON.stringify(entry, null, 2), { mode: 0o600 });
  } catch (err) {
    console.error("[bind] could not record the World verification", err);
  }
}

export function recallVerification(): KnownHuman | null {
  try {
    if (!existsSync(STORE)) return null;
    const parsed = JSON.parse(readFileSync(STORE, "utf8")) as Partial<KnownHuman>;
    if (!parsed?.nullifierHash || !parsed.verifiedAt) return null;
    return {
      nullifierHash: parsed.nullifierHash,
      verifiedAt: parsed.verifiedAt,
      mode: parsed.mode === "live" ? "live" : "sandbox",
    };
  } catch {
    return null;
  }
}
