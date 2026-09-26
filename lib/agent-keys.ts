import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

/**
 * Real Sui keypairs for agents.
 *
 * An agent's address used to be a hash of its name — a label that looked
 * like an address and could never hold anything. These are actual
 * Ed25519 keypairs, so an agent has an address that can genuinely
 * receive funds and be looked up on an explorer.
 *
 * Secrets are encrypted at rest with AES-256-GCM under
 * BIND_AGENT_KEY_SECRET and only ever decrypted server-side. They are
 * never returned to the browser, never persisted to localStorage, and
 * never included in the wallet snapshot the client holds.
 *
 * Worth being clear about the threat model: this protects the key from
 * anything reading stored state, not from someone who already has both
 * the stored state and the env var. A production deployment would put
 * BIND_AGENT_KEY_SECRET in a KMS rather than a .env file.
 */

const ALGO = "aes-256-gcm";

function masterKey(): Buffer | null {
  const hex = process.env.BIND_AGENT_KEY_SECRET;
  if (!hex) return null;
  const key = Buffer.from(hex.replace(/^0x/, ""), "hex");
  return key.length === 32 ? key : null;
}

export interface SealedKey {
  /** iv:ciphertext:authTag, all hex */
  sealed: string;
}

export function sealSecret(secretKeyBech32: string): SealedKey | null {
  const key = masterKey();
  if (!key) return null;

  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(secretKeyBech32, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { sealed: `${iv.toString("hex")}:${ct.toString("hex")}:${tag.toString("hex")}` };
}

export function openSecret(sealed: string): string | null {
  const key = masterKey();
  if (!key) return null;

  const [ivHex, ctHex, tagHex] = sealed.split(":");
  if (!ivHex || !ctHex || !tagHex) return null;

  try {
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(ctHex, "hex")), decipher.final()]).toString("utf8");
  } catch {
    // Wrong master key, or the ciphertext was tampered with. Either way
    // this key is unusable — say nothing more than that.
    return null;
  }
}

/**
 * Where sealed secrets outlive the process.
 *
 * The wallet's state lives in memory, and the browser keeps a backup —
 * but that backup goes through `stripSecrets`, so restoring from it gave
 * back an agent that could never sign again. A restart therefore
 * orphaned every agent permanently, funded address and all, which is an
 * unusable way to run anything.
 *
 * What lands on disk is the same AES-256-GCM blob that was already
 * described as encrypted at rest: worthless without
 * BIND_AGENT_KEY_SECRET, which is deliberately not in this file.
 */
const KEYSTORE = resolve(process.env.BIND_KEYSTORE_PATH ?? ".bind-keys.json");

function readKeystore(): Record<string, string> {
  try {
    if (!existsSync(KEYSTORE)) return {};
    const parsed = JSON.parse(readFileSync(KEYSTORE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    // A corrupt keystore shouldn't take the wallet down with it; the
    // agents it covered simply read as unsignable.
    return {};
  }
}

/** Keyed by address, because that's what survives in every snapshot. */
export function rememberSealed(address: string, sealed: string): void {
  try {
    mkdirSync(dirname(KEYSTORE), { recursive: true });
    writeFileSync(KEYSTORE, JSON.stringify({ ...readKeystore(), [address]: sealed }, null, 2), {
      mode: 0o600,
    });
  } catch (err) {
    console.error("[bind] could not write the agent keystore", err);
  }
}

export function recallSealed(address: string): string | undefined {
  return readKeystore()[address];
}

export interface NewAgentIdentity {
  address: string;
  sealedSecret?: string;
  /** False when no master key is configured — the address is real, but
   *  we can't safely keep the secret, so the agent can receive and be
   *  watched while nothing can sign on its behalf. */
  signable: boolean;
}

/** Mints a fresh, real Sui identity for an agent. */
export function createAgentIdentity(): NewAgentIdentity {
  const keypair = new Ed25519Keypair();
  const address = keypair.getPublicKey().toSuiAddress();
  const sealed = sealSecret(keypair.getSecretKey());

  if (!sealed) return { address, signable: false };

  rememberSealed(address, sealed.sealed);
  return { address, sealedSecret: sealed.sealed, signable: true };
}

/** Rehydrates an agent's signer. Server-side only. */
export function agentKeypair(sealed: string | undefined): Ed25519Keypair | null {
  if (!sealed) return null;
  const secret = openSecret(sealed);
  return secret ? Ed25519Keypair.fromSecretKey(secret) : null;
}

export function isAgentKeyStorageConfigured(): boolean {
  return masterKey() !== null;
}
