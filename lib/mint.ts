import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { suiClient, fundedGasCoin } from "./sui";
import type { Attestation } from "./attest";
import type { Declaration } from "./types";
import type { SuiClientTypes } from "@mysten/sui/client";

/**
 * Real on-chain calls into the published `bind` package — used once
 * BIND_PACKAGE_ID / BIND_REGISTRY_ID / BIND_VAULT_ID / BIND_AGENT_CAP_ID /
 * BIND_EXECUTOR_KEY are all set (see scripts/deploy.sh, which publishes the
 * package, shares a funded Vault, and writes these into .env.local).
 * Until then, lib/pipeline.ts uses a clearly-labelled simulated proof
 * instead — the Move contracts and their tests are real regardless; this
 * module is what makes the demo's *execution* real too, once gas exists.
 *
 * Built on `SuiGrpcClient` (see lib/sui.ts) — the public testnet fullnode
 * has fully retired JSON-RPC, so `signAndExecuteTransaction` here returns
 * gRPC's `{$kind, Transaction | FailedTransaction}` shape, not the old
 * `{digest, objectChanges}` response.
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

type EffectsInclude = { effects: true; objectTypes: true };

/** Runs a moveCall-only transaction and returns its checked effects + a
 * lookup of created-object-id -> Move type, or throws on failure. */
async function callAndGetEffects(tx: Transaction, keypair: Ed25519Keypair, address: string) {
  const client = suiClient();

  // Explicit, freshly-fetched gas payment rather than automatic
  // resolution — several of these run back to back against one address,
  // and letting each call re-discover gas independently is what avoids
  // handing the network an object version it has already superseded.
  const gas = await fundedGasCoin(address);
  if (!gas) throw new Error(`bind: executor address ${address} has no spendable gas coin`);
  tx.setGasPayment([{ objectId: gas.objectId, version: gas.version, digest: gas.digest }]);
  tx.setGasBudget(30_000_000n);

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    include: { effects: true, objectTypes: true } satisfies EffectsInclude,
  });

  if (result.$kind === "FailedTransaction") {
    throw new Error(`bind: transaction failed — ${JSON.stringify(result.FailedTransaction.status)}`);
  }

  // Bind runs several of these sequentially against one executor address,
  // all touching the same gas coin. Without waiting for this one to
  // checkpoint, the next call's automatic gas-object resolution can pick
  // up a version the network has already superseded ("object unavailable
  // for consumption") — a real race this project hit the moment it first
  // ran three real transactions back to back.
  await client.waitForTransaction({ result });

  return result.Transaction;
}

function findCreatedObjectId(
  t: NonNullable<SuiClientTypes.TransactionResult<EffectsInclude>["Transaction"]>,
  typeSuffix: string
): string {
  const objectTypes = t.objectTypes ?? {};
  const created = (t.effects?.changedObjects ?? []).find(
    (c) => c.idOperation === "Created" && objectTypes[c.objectId]?.endsWith(typeSuffix)
  );
  if (!created) throw new Error(`bind: no created object ending in ${typeSuffix} found in tx effects`);
  return created.objectId;
}

export async function mintDeclarationOnChain(decl: Declaration): Promise<{ declarationObjectId: string; digest: string }> {
  const { keypair, address } = executor();
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

  const t = await callAndGetEffects(tx, keypair, address);
  return { declarationObjectId: findCreatedObjectId(t, "::declaration::Declaration"), digest: t.digest };
}

export async function mintMatchProofOnChain(input: {
  declarationId: string; // must be the REAL on-chain Declaration object id
  // (from mintDeclarationOnChain), not the agent's in-memory string id —
  // the attestation must be signed over that same real id or E_BAD_SIG fires.
  effectsDigest: string;
  attestation: Attestation;
}): Promise<{ proofObjectId: string; digest: string }> {
  const { keypair, address } = executor();
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

  const t = await callAndGetEffects(tx, keypair, address);
  return { proofObjectId: findCreatedObjectId(t, "::proofs::MatchProof"), digest: t.digest };
}

export async function executeDeclaredOnChain(input: {
  declaration: Declaration;
  declarationObjectId: string;
  matchProofId: string;
}): Promise<{ digest: string }> {
  const { keypair, address } = executor();
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

  const t = await callAndGetEffects(tx, keypair, address);
  return { digest: t.digest };
}

export async function mintOverrideApprovalOnChain(input: {
  declarationId: string;
  effectsDigest: string;
  nullifierHashHex: string;
  verifiedAtMs: number;
  attestation: Attestation;
}): Promise<{ approvalObjectId: string; digest: string }> {
  const { keypair, address } = executor();
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

  const t = await callAndGetEffects(tx, keypair, address);
  return { approvalObjectId: findCreatedObjectId(t, "::proofs::OverrideApproval"), digest: t.digest };
}

export async function executeWithOverrideOnChain(input: {
  declarationObjectId: string;
  overrideApprovalId: string;
}): Promise<{ digest: string }> {
  const { keypair, address } = executor();
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

  const t = await callAndGetEffects(tx, keypair, address);
  return { digest: t.digest };
}

/**
 * Adds an address to the on-chain vault's allow-list.
 *
 * This has to happen, not just the wallet's local list: `execute_declared`
 * asserts `vec_set::contains(&v.allowlist, &recipient)` on chain, so an
 * address promoted only in the UI would abort with E_NOT_ALLOWLISTED the
 * first time the agent tried to use it. Local state and chain state have
 * to agree, and the chain is the one that decides.
 *
 * Note this is signed by the executor, which must be the vault's `owner`
 * — `set_allowlist_add` is owner-only by design.
 */
export async function addToAllowlistOnChain(input: {
  vaultObjectId: string;
  address: string;
}): Promise<{ digest: string }> {
  const { keypair, address } = executor();
  const tx = new Transaction();
  tx.setSender(address);

  tx.moveCall({
    target: `${pkg()}::allowance_vault::set_allowlist_add`,
    typeArguments: ["0x2::sui::SUI"],
    arguments: [tx.object(input.vaultObjectId), tx.pure.address(input.address)],
  });

  const t = await callAndGetEffects(tx, keypair, address);
  return { digest: t.digest };
}

/**
 * Sends SUI from the operator's own key to an agent's address.
 *
 * Nothing about the vault — an agent's address is an ordinary Sui
 * address, and it needs a coin of its own before it can pay for a single
 * transaction. This is the operator topping up their agent.
 */
export async function fundAgentAddress(input: {
  recipient: string;
  amountMist: bigint;
}): Promise<{ digest: string }> {
  const { keypair, address } = executor();
  const tx = new Transaction();
  tx.setSender(address);

  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(input.amountMist)]);
  tx.transferObjects([coin], tx.pure.address(input.recipient));

  const t = await callAndGetEffects(tx, keypair, address);
  return { digest: t.digest };
}

/**
 * Takes an address back off the on-chain allow-list.
 *
 * The mirror of the above, and for the same reason: withdrawing standing
 * permission only in the wallet's own copy would leave the vault still
 * willing to pay that address the moment anything else signed for it.
 */
export async function removeFromAllowlistOnChain(input: {
  vaultObjectId: string;
  address: string;
}): Promise<{ digest: string }> {
  const { keypair, address } = executor();
  const tx = new Transaction();
  tx.setSender(address);

  tx.moveCall({
    target: `${pkg()}::allowance_vault::set_allowlist_remove`,
    typeArguments: ["0x2::sui::SUI"],
    arguments: [tx.object(input.vaultObjectId), tx.pure.address(input.address)],
  });

  const t = await callAndGetEffects(tx, keypair, address);
  return { digest: t.digest };
}
