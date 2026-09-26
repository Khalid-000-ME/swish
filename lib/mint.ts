import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { suiClient } from "./sui";
import type { Attestation } from "./attest";
import type { Declaration } from "./types";

/**
 * Real on-chain calls into the published `bind` package — used once
 * BIND_PACKAGE_ID / BIND_REGISTRY_ID / BIND_VAULT_ID / BIND_AGENT_CAP_ID /
 * BIND_EXECUTOR_KEY are all set (see scripts/deploy.ts, which publishes the
 * package, shares a funded Vault, and writes these into .env.local).
 * Until then, lib/pipeline.ts uses a clearly-labelled simulated proof
 * instead — the Move contracts and their tests are real regardless; this
 * module is what makes the demo's *execution* real too, once gas exists.
 *
 * [VERIFY before first live run]: argument encoding below (`tx.pure.*`
 * shapes, byte layout of `coin_type`/`reason_hash`) against the actual
 * deployed package — this was written against the Move source in
 * bind/sources/ and the @mysten/sui v2 Transaction builder API, but has
 * not yet been exercised against a funded signer end-to-end.
 */

export function isMintConfigured(): boolean {
  return Boolean(
    process.env.BIND_PACKAGE_ID &&
      process.env.BIND_REGISTRY_ID &&
      process.env.BIND_VAULT_ID &&
      process.env.BIND_AGENT_CAP_ID &&
      process.env.BIND_EXECUTOR_KEY
  );
}

function executor(): { keypair: Ed25519Keypair; address: string } {
  const raw = process.env.BIND_EXECUTOR_KEY!;
  const keypair = raw.startsWith("suiprivkey")
    ? Ed25519Keypair.fromSecretKey(raw)
    : Ed25519Keypair.fromSecretKey(new Uint8Array(Buffer.from(raw.replace(/^0x/, ""), "hex")));
  return { keypair, address: keypair.getPublicKey().toSuiAddress() };
}

const pkg = () => process.env.BIND_PACKAGE_ID!;

export async function mintDeclarationOnChain(decl: Declaration): Promise<{ declarationObjectId: string; digest: string }> {
  const { keypair, address } = executor();
  const client = suiClient();
  const tx = new Transaction();
  tx.setSender(address);

  const declObj = tx.moveCall({
    target: `${pkg()}::declaration::mint`,
    arguments: [
      tx.object(process.env.BIND_AGENT_CAP_ID!),
      tx.pure.id(decl.vaultId),
      tx.pure.address(decl.recipient),
      tx.pure.vector("u8", Array.from(Buffer.from(decl.coinType))),
      tx.pure.u64(decl.maxAmount),
      tx.pure.u64(BigInt(decl.expiresMs)),
      tx.pure.vector("u8", Array.from(Buffer.from(decl.reasonHash, "hex"))),
      tx.pure.u64(BigInt(decl.nonce)),
    ],
  });
  tx.transferObjects([declObj], tx.pure.address(address));

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showObjectChanges: true },
  });
  await client.waitForTransaction({ digest: result.digest });

  const created = result.objectChanges?.find(
    (c) => c.type === "created" && "objectType" in c && c.objectType.endsWith("::declaration::Declaration")
  );
  if (!created || !("objectId" in created)) throw new Error("bind: Declaration object not found in tx effects");
  return { declarationObjectId: created.objectId, digest: result.digest };
}

export async function mintMatchProofOnChain(input: {
  declarationId: string; // BIND_PRD note: caller must pass the REAL on-chain
  // Declaration object id (from mintDeclarationOnChain), not the agent's
  // in-memory string id — the attestation must be signed over that same
  // real id (see attestMatch / canonicalAttestMessage) or E_BAD_SIG fires.
  effectsDigest: string;
  attestation: Attestation;
}): Promise<{ proofObjectId: string; digest: string }> {
  const { keypair, address } = executor();
  const client = suiClient();
  const tx = new Transaction();
  tx.setSender(address);

  const proof = tx.moveCall({
    target: `${pkg()}::proofs::mint_match_proof`,
    arguments: [
      tx.object(process.env.BIND_REGISTRY_ID!),
      tx.pure.id(input.declarationId),
      tx.pure.vector("u8", Array.from(Buffer.from(input.effectsDigest.replace(/^0x/, ""), "hex"))),
      tx.pure.vector("u8", Array.from(Buffer.from(input.attestation.signature.replace(/^0x/, ""), "hex"))),
    ],
  });
  tx.transferObjects([proof], tx.pure.address(address));

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showObjectChanges: true },
  });
  await client.waitForTransaction({ digest: result.digest });

  const created = result.objectChanges?.find(
    (c) => c.type === "created" && "objectType" in c && c.objectType.endsWith("::proofs::MatchProof")
  );
  if (!created || !("objectId" in created)) throw new Error("bind: MatchProof object not found in tx effects");
  return { proofObjectId: created.objectId, digest: result.digest };
}

export async function executeDeclaredOnChain(input: {
  declaration: Declaration;
  declarationObjectId: string;
  matchProofId: string;
}): Promise<{ digest: string }> {
  const { keypair, address } = executor();
  const client = suiClient();
  const tx = new Transaction();
  tx.setSender(address);

  tx.moveCall({
    target: `${pkg()}::allowance_vault::execute_declared`,
    typeArguments: ["0x2::sui::SUI"],
    arguments: [
      tx.object(process.env.BIND_VAULT_ID!),
      tx.object(input.declarationObjectId),
      tx.object(input.matchProofId),
      tx.object.clock(),
    ],
  });

  const result = await client.signAndExecuteTransaction({ signer: keypair, transaction: tx });
  await client.waitForTransaction({ digest: result.digest });
  return { digest: result.digest };
}

export async function mintOverrideApprovalOnChain(input: {
  declarationId: string;
  effectsDigest: string;
  nullifierHashHex: string;
  verifiedAtMs: number;
  attestation: Attestation;
}): Promise<{ approvalObjectId: string; digest: string }> {
  const { keypair, address } = executor();
  const client = suiClient();
  const tx = new Transaction();
  tx.setSender(address);

  const approval = tx.moveCall({
    target: `${pkg()}::proofs::mint_override_approval`,
    arguments: [
      tx.object(process.env.BIND_REGISTRY_ID!),
      tx.pure.id(input.declarationId),
      tx.pure.vector("u8", Array.from(Buffer.from(input.effectsDigest.replace(/^0x/, ""), "hex"))),
      tx.pure.vector("u8", Array.from(Buffer.from(input.nullifierHashHex, "hex"))),
      tx.pure.u64(BigInt(input.verifiedAtMs)),
      tx.pure.vector("u8", Array.from(Buffer.from(input.attestation.signature.replace(/^0x/, ""), "hex"))),
    ],
  });
  tx.transferObjects([approval], tx.pure.address(address));

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showObjectChanges: true },
  });
  await client.waitForTransaction({ digest: result.digest });

  const created = result.objectChanges?.find(
    (c) => c.type === "created" && "objectType" in c && c.objectType.endsWith("::proofs::OverrideApproval")
  );
  if (!created || !("objectId" in created)) throw new Error("bind: OverrideApproval object not found in tx effects");
  return { approvalObjectId: created.objectId, digest: result.digest };
}

export async function executeWithOverrideOnChain(input: {
  declarationObjectId: string;
  overrideApprovalId: string;
}): Promise<{ digest: string }> {
  const { keypair, address } = executor();
  const client = suiClient();
  const tx = new Transaction();
  tx.setSender(address);

  tx.moveCall({
    target: `${pkg()}::allowance_vault::execute_with_override`,
    typeArguments: ["0x2::sui::SUI"],
    arguments: [
      tx.object(process.env.BIND_VAULT_ID!),
      tx.object(input.declarationObjectId),
      tx.object(input.overrideApprovalId),
      tx.object.clock(),
    ],
  });

  const result = await client.signAndExecuteTransaction({ signer: keypair, transaction: tx });
  await client.waitForTransaction({ digest: result.digest });
  return { digest: result.digest };
}
