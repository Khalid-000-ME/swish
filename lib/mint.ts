import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { suiClient, allGasCoins } from "./sui";
import type { Attestation } from "./attest";
import type { Declaration } from "./types";
import type { SuiClientTypes } from "@mysten/sui/client";

/**
 * Real on-chain calls into the published `bind` package — used once
 * SWISH_PACKAGE_ID / SWISH_REGISTRY_ID / SWISH_VAULT_ID / SWISH_AGENT_CAP_ID /
 * SWISH_EXECUTOR_KEY are all set (see scripts/deploy.sh, which publishes the
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
    process.env.SWISH_PACKAGE_ID &&
      process.env.SWISH_REGISTRY_ID &&
      process.env.SWISH_VAULT_ID &&
      process.env.SWISH_AGENT_CAP_ID &&
      process.env.SWISH_EXECUTOR_KEY
  );
}

function executor(): { keypair: Ed25519Keypair; address: string } {
  const raw = process.env.SWISH_EXECUTOR_KEY!;
  const keypair = raw.startsWith("suiprivkey")
    ? Ed25519Keypair.fromSecretKey(raw)
    : Ed25519Keypair.fromSecretKey(new Uint8Array(Buffer.from(raw.replace(/^0x/, ""), "hex")));
  return { keypair, address: keypair.getPublicKey().toSuiAddress() };
}

const pkg = () => process.env.SWISH_PACKAGE_ID!;

/** Reserved from the gas coins while a transaction runs — see below. */
export const GAS_BUDGET_MIST = 10_000_000n;

/**
 * The address that owns the vault and pays for owner operations.
 *
 * Not the same as `operator.address`, which is the keypair the wallet
 * mints at sign-in and uses as an identity. The vault was published by
 * SWISH_EXECUTOR_KEY and `owner_withdraw` asserts that owner, so this is
 * where money taken out of the vault has to land and what funds an agent.
 * Sending it to the sign-in address instead would put it somewhere the
 * wallet never spends from.
 */
export function executorAddress(): string | null {
  try {
    return executor().address;
  } catch {
    return null;
  }
}

/** What that address can actually spend, for a check before a Move abort. */
export async function executorBalanceMist(): Promise<bigint> {
  const address = executorAddress();
  if (!address) return 0n;
  try {
    const res = await suiClient().getBalance({ owner: address, coinType: "0x2::sui::SUI" });
    return BigInt(res.balance.balance ?? "0");
  } catch {
    return 0n;
  }
}

type EffectsInclude = { effects: true; objectTypes: true };

/** Runs a moveCall-only transaction and returns its checked effects + a
 * lookup of created-object-id -> Move type, or throws on failure. */
async function callAndGetEffects(tx: Transaction, keypair: Ed25519Keypair, address: string) {
  const client = suiClient();

  // Explicit, freshly-fetched gas payment rather than automatic
  // resolution — several of these run back to back against one address,
  // and letting each call re-discover gas independently is what avoids
  // handing the network an object version it has already superseded.
  // All the coins, not one. An address accumulates coins as it receives
  // transfers, and a call that splits an amount out of `tx.gas` fails with
  // InsufficientCoinBalance whenever that amount exceeds any single coin —
  // even with plenty of SUI spread across several.
  const gas = await allGasCoins(address);
  if (gas.length === 0) {
    throw new Error(`swish: executor address ${address} has no spendable gas coin`);
  }
  tx.setGasPayment(gas);
  // Sui reserves the whole budget from the gas coins for the duration of
  // the transaction, so a budget is a floor on what the sender must hold,
  // not just a cap on what it may spend. At 30 mSUI a 0.025 transfer
  // needed 0.055 on hand and failed with InsufficientCoinBalance while
  // holding 0.035. These are single moveCalls; 10 mSUI is ample.
  tx.setGasBudget(GAS_BUDGET_MIST);

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    include: { effects: true, objectTypes: true } satisfies EffectsInclude,
  });

  if (result.$kind === "FailedTransaction") {
    throw new Error(`bind: transaction failed — ${JSON.stringify(result.FailedTransaction.status)}`);
  }

  // Swish runs several of these sequentially against one executor address,
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
      tx.object(process.env.SWISH_AGENT_CAP_ID!),
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
      tx.object(process.env.SWISH_REGISTRY_ID!),
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
      tx.object(process.env.SWISH_VAULT_ID!),
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
      tx.object(process.env.SWISH_REGISTRY_ID!),
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
      tx.object(process.env.SWISH_VAULT_ID!),
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
 * Sends SUI out of an agent's own address, signed by that agent.
 *
 * The counterpart to funding one. Money that went into an agent's address
 * for gas used to have no way back out — the operator could top it up and
 * then watch it sit there. This is the agent's key signing an ordinary
 * transfer, not a vault operation, because the agent genuinely owns that
 * address.
 *
 * `amountMist` of null sweeps everything the address holds, less a margin
 * for the gas this transaction itself costs. Splitting the exact balance
 * would leave nothing to pay with.
 */
export async function sendFromAgent(input: {
  agentKeypair: Ed25519Keypair;
  recipient: string;
  amountMist: bigint | null;
}): Promise<{ digest: string; sentMist: bigint }> {
  const client = suiClient();
  const address = input.agentKeypair.toSuiAddress();

  // Every coin, not one. The amount below comes from the address's total
  // balance, and paying from a single coin fails the moment that balance
  // is spread across several — which it is as soon as an address has been
  // topped up twice.
  const gas = await allGasCoins(address);
  if (gas.length === 0) throw new Error(`${address} holds no SUI`);

  const held = await client.getBalance({ owner: address, coinType: "0x2::sui::SUI" });
  const total = BigInt(held.balance.balance ?? "0");

  const budget = 6_000_000n;
  const amount = input.amountMist ?? total - budget;
  if (amount <= 0n) {
    throw new Error(
      `${address} holds ${Number(total) / 1e9} SUI, which is not enough to cover this transaction's own gas`
    );
  }
  if (amount + budget > total) {
    throw new Error(
      `${address} holds ${Number(total) / 1e9} SUI — not enough for ${Number(amount) / 1e9} plus gas`
    );
  }

  const tx = new Transaction();
  tx.setSender(address);
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);
  tx.transferObjects([coin], tx.pure.address(input.recipient));
  tx.setGasPayment(gas);
  tx.setGasBudget(budget);

  const result = await client.signAndExecuteTransaction({
    signer: input.agentKeypair,
    transaction: tx,
    include: { effects: true },
  });
  if (result.$kind === "FailedTransaction") {
    throw new Error(`transfer failed: ${JSON.stringify(result.FailedTransaction.status)}`);
  }
  return { digest: result.Transaction.digest, sentMist: amount };
}

/**
 * Puts SUI from an agent's own address back into the vault.
 *
 * `deposit` is public — anyone may fund a vault — so the agent can do
 * this itself without the owner's key being involved.
 */
export async function depositFromAgent(input: {
  agentKeypair: Ed25519Keypair;
  vaultObjectId: string;
  amountMist: bigint;
}): Promise<{ digest: string }> {
  const client = suiClient();
  const address = input.agentKeypair.toSuiAddress();

  const gas = await allGasCoins(address);
  if (gas.length === 0) throw new Error(`${address} holds no SUI`);

  const tx = new Transaction();
  tx.setSender(address);
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(input.amountMist)]);
  tx.moveCall({
    target: `${pkg()}::allowance_vault::deposit`,
    typeArguments: ["0x2::sui::SUI"],
    arguments: [tx.object(input.vaultObjectId), coin],
  });
  tx.setGasPayment(gas);
  tx.setGasBudget(10_000_000n);

  const result = await client.signAndExecuteTransaction({
    signer: input.agentKeypair,
    transaction: tx,
    include: { effects: true },
  });
  if (result.$kind === "FailedTransaction") {
    throw new Error(`deposit failed: ${JSON.stringify(result.FailedTransaction.status)}`);
  }
  return { digest: result.Transaction.digest };
}

/**
 * Moves money out of the vault to an agent's own address.
 *
 * This is the owner spending their own budget, not the agent spending
 * theirs: `owner_withdraw` asserts the caller is the vault's owner and
 * goes nowhere near the per-payment cap, the rolling window, the
 * allow-list or a Declaration. Those exist to bound the agent.
 *
 * Available only since the package upgrade that added the function — a
 * vault published before it will abort, which the caller reports rather
 * than swallowing.
 */
export async function withdrawFromVault(input: {
  vaultObjectId: string;
  recipient: string;
  amountMist: bigint;
}): Promise<{ digest: string }> {
  const { keypair, address } = executor();
  const tx = new Transaction();
  tx.setSender(address);

  tx.moveCall({
    target: `${pkg()}::allowance_vault::owner_withdraw`,
    typeArguments: ["0x2::sui::SUI"],
    arguments: [
      tx.object(input.vaultObjectId),
      tx.pure.u64(input.amountMist),
      tx.pure.address(input.recipient),
    ],
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
