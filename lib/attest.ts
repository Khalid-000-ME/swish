import * as ed from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes, concatBytes } from "@noble/hashes/utils.js";

/**
 * The backend's attestation key (BIND_PRD.md §6.3 `proofs.move`). It signs
 * the canonical bytes of (declaration_id, effects_digest[, nullifier_hash])
 * and the *chain* verifies that signature via `sui::ed25519::ed25519_verify`
 * before minting a MatchProof / OverrideApproval — so a proof existing on
 * chain is never just "the backend's say-so", it's independently checkable.
 *
 * Dev-mode: if SWISH_ATTEST_PRIVKEY is unset, a key is generated in-memory
 * for the life of the process and logged once. Fine for a hackathon demo;
 * disclosed here so nobody mistakes it for a production key-management story.
 */

let cachedKey: { priv: Uint8Array; pub: Uint8Array } | null = null;

async function getKeypair() {
  if (cachedKey) return cachedKey;

  const envKey = process.env.SWISH_ATTEST_PRIVKEY;
  const priv = envKey ? hexToBytes(envKey.replace(/^0x/, "")) : ed.utils.randomSecretKey();
  const pub = await ed.getPublicKeyAsync(priv);

  if (!envKey) {
    console.warn(
      "[swish/attest] SWISH_ATTEST_PRIVKEY not set — generated an ephemeral dev key. " +
        `Public key (register this in AttestorRegistry on-chain): 0x${bytesToHex(pub)}`
    );
  }

  cachedKey = { priv, pub };
  return cachedKey;
}

export async function attestPublicKeyHex(): Promise<string> {
  const { pub } = await getKeypair();
  return `0x${bytesToHex(pub)}`;
}

function u64le(n: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  let v = n;
  for (let i = 0; i < 8; i++) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return buf;
}

/**
 * Canonical message bytes the chain re-derives on-chain (see
 * `canonical_message` in proofs.move) before checking the signature — the
 * declaration id and effects digest are hex-decoded to their raw 32 bytes,
 * exactly as `object::id_to_bytes` would produce, so the signed message and
 * the on-chain reconstruction are byte-for-byte identical. Binding the
 * `declaration_id` into the *signed* bytes (rather than trusting it as a
 * separate, unverified call argument) is what closes the gap the "Whisper
 * Attacks" paper names: signing the transaction but not the decision.
 */
export function canonicalAttestMessage(input: {
  declarationId: string;
  effectsDigest: string;
  nullifierHash?: Uint8Array;
  timestampMs: number;
}): Uint8Array {
  const parts = [
    hexToBytes(input.declarationId.replace(/^0x/, "")),
    hexToBytes(input.effectsDigest.replace(/^0x/, "")),
    input.nullifierHash ?? new Uint8Array(0),
    u64le(BigInt(input.timestampMs)),
  ];
  return sha256(concatBytes(...parts));
}

export function nullifierHashBytes(nullifierHash: string): Uint8Array {
  return utf8ToBytes(nullifierHash);
}

/** Mint-ready attestation for the clean-diff auto path — no human involved,
 * so timestamp and nullifier are both the fixed zero/empty the Move side
 * uses for `mint_match_proof`. */
export async function attestMatch(input: { declarationId: string; effectsDigest: string }): Promise<Attestation> {
  const msg = canonicalAttestMessage({
    declarationId: input.declarationId,
    effectsDigest: input.effectsDigest,
    timestampMs: 0,
  });
  return signAttestation(msg);
}

export interface Attestation {
  message: string; // hex
  signature: string; // hex
  pubkey: string; // hex
}

export async function signAttestation(msg: Uint8Array): Promise<Attestation> {
  const { priv, pub } = await getKeypair();
  const sig = await ed.signAsync(msg, priv);
  return {
    message: `0x${bytesToHex(msg)}`,
    signature: `0x${bytesToHex(sig)}`,
    pubkey: `0x${bytesToHex(pub)}`,
  };
}

export async function verifyAttestation(att: Attestation): Promise<boolean> {
  return ed.verifyAsync(
    hexToBytes(att.signature.replace(/^0x/, "")),
    hexToBytes(att.message.replace(/^0x/, "")),
    hexToBytes(att.pubkey.replace(/^0x/, ""))
  );
}

export function digestBytes(bytes: Uint8Array): string {
  return `0x${bytesToHex(sha256(bytes))}`;
}
