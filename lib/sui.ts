import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import type { BalanceChange, DryRunResult, ObjectChange } from "./types";

/**
 * Chain adapter. Built on `SuiGrpcClient`, not the JSON-RPC client — the
 * public testnet fullnode has fully retired JSON-RPC (every method,
 * including basic health checks, now returns "Method not found... migrate
 * to gRPC or GraphQL"), even though `sui client gas` keeps working because
 * the CLI already talks gRPC under the hood. `simulateTransaction` here is
 * the direct replacement for `devInspectTransactionBlock`/
 * `dryRunTransactionBlock` — same idea, unified transport.
 */
const NETWORK = (process.env.SUI_NETWORK as "testnet" | "mainnet" | "devnet") ?? "testnet";
const GRPC_BASE_URL =
  process.env.SUI_GRPC_URL ??
  { testnet: "https://fullnode.testnet.sui.io:443", mainnet: "https://fullnode.mainnet.sui.io:443", devnet: "https://fullnode.devnet.sui.io:443" }[
    NETWORK
  ];

let _client: SuiGrpcClient | null = null;
export function suiClient(): SuiGrpcClient {
  if (!_client) {
    _client = new SuiGrpcClient({ network: NETWORK, baseUrl: GRPC_BASE_URL });
  }
  return _client;
}

export const SWISH_PACKAGE_ID = process.env.SWISH_PACKAGE_ID || null;

function normalizeOwner(owner: unknown): string {
  if (typeof owner === "string") return owner; // "Immutable"
  if (owner && typeof owner === "object") {
    const o = owner as Record<string, unknown>;
    if (typeof o.AddressOwner === "string") return o.AddressOwner;
    if (typeof o.ObjectOwner === "string") return o.ObjectOwner;
    if (o.Shared || o.$kind === "Shared") return "shared";
    if (o.ConsensusAddressOwner && typeof (o.ConsensusAddressOwner as { owner?: string }).owner === "string") {
      return (o.ConsensusAddressOwner as { owner: string }).owner;
    }
  }
  return "unknown";
}

/** Does `address` own at least one real SUI coin we can pay gas with? */
export async function fundedGasCoin(address: string): Promise<{ objectId: string; version: string; digest: string } | null> {
  try {
    const coins = await suiClient().listCoins({ owner: address, coinType: "0x2::sui::SUI" });
    const spendable = coins.objects.find((c) => BigInt(c.balance) > 0n);
    if (!spendable) return null;
    return { objectId: spendable.objectId, version: spendable.version, digest: spendable.digest };
  } catch {
    return null;
  }
}

export interface PtbSpec {
  sender: string;
  /** [recipient, amountMist] pairs — the *declared* leg(s) of the payment. */
  declaredLegs: Array<[string, bigint]>;
  /** Extra transfers the declaration never mentioned — for the villain PTBs. */
  undeclaredLegs?: Array<[string, bigint]>;
}

export function buildPtb(spec: PtbSpec): Transaction {
  const tx = new Transaction();
  tx.setSender(spec.sender);
  const legs = [...spec.declaredLegs, ...(spec.undeclaredLegs ?? [])];
  for (const [recipient, amount] of legs) {
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);
    tx.transferObjects([coin], tx.pure.address(recipient));
  }
  return tx;
}

/** Anything shaped like a capability/admin/upgrade object type. */
const CAP_RE = /(::.*Cap\b|Capability|AdminCap|TreasuryCap|OwnerCap|UpgradeCap)/i;

/**
 * Real simulateTransaction against testnet when the sender owns gas;
 * otherwise returns null so the caller can fall back to a disclosed,
 * labelled fixture. This is the only place "do we actually have chain
 * access right now" is decided.
 */
export async function dryRun(tx: Transaction, sender: string): Promise<DryRunResult | null> {
  const gas = await allGasCoins(sender);
  if (gas.length === 0) return null;

  tx.setGasPayment(gas);
  tx.setGasBudget(10_000_000n);

  const client = suiClient();
  const result = await client.simulateTransaction({
    transaction: tx,
    include: { balanceChanges: true, effects: true, objectTypes: true },
  });

  const t = result.$kind === "Transaction" ? result.Transaction : result.FailedTransaction;
  const status = result.$kind === "Transaction" ? "success" : "failure";
  const error = !t.status.success ? t.status.error.message : undefined;

  const balanceChanges: BalanceChange[] = (t.balanceChanges ?? []).map((b) => ({
    owner: b.address,
    coinType: b.coinType,
    amount: BigInt(b.amount),
  }));

  const objectTypes = t.objectTypes ?? {};
  const objectChanges: ObjectChange[] = (t.effects?.changedObjects ?? []).map((c) => {
    const objectType = objectTypes[c.objectId];
    if (c.idOperation === "Created") {
      return { type: "created", objectId: c.objectId, objectType, recipient: normalizeOwner(c.outputOwner) };
    }
    if (c.idOperation === "Deleted") {
      return { type: "deleted", objectId: c.objectId, objectType };
    }
    const ownerChanged = normalizeOwner(c.inputOwner) !== normalizeOwner(c.outputOwner);
    return ownerChanged
      ? { type: "transferred", objectId: c.objectId, objectType, recipient: normalizeOwner(c.outputOwner) }
      : { type: "mutated", objectId: c.objectId, objectType };
  });

  // A capability-shaped object appearing anywhere among the effects is
  // itself the "hidden permission grant" violation, whether the diff
  // engine's asset-flow check catches it or not — surfaced here as a
  // best-effort signal even on changedObjects the type map didn't cover.
  for (const c of t.effects?.changedObjects ?? []) {
    const objectType = objectTypes[c.objectId];
    if (objectType && CAP_RE.test(objectType) && !objectChanges.some((oc) => oc.objectId === c.objectId)) {
      objectChanges.push({ type: "created", objectId: c.objectId, objectType, recipient: normalizeOwner(c.outputOwner) });
    }
  }

  return {
    status,
    error,
    balanceChanges,
    objectChanges,
    effectsDigest: t.digest ?? "0x" + "0".repeat(64),
  };
}

export function isLiveChainConfigured(): boolean {
  return Boolean(SWISH_PACKAGE_ID);
}

/**
 * What a published vault actually holds, read from the object itself.
 *
 * The wallet's own `balanceMist` for an envelope is whatever the operator
 * typed at hire time — it was never reconciled with the chain, so a vault
 * holding 0.01 SUI could show as 0.3 and a withdrawal would be refused by
 * a number the UI never displayed.
 *
 * `Vault<T>` starts `id: UID` (a 32-byte ObjectID) followed immediately by
 * `Balance<T>`, which is a single u64. So the balance is bytes 32..39,
 * little-endian. That offset is an assumption about the struct's field
 * order; if a field is ever added ahead of `balance` in
 * allowance_vault.move, this reads the wrong eight bytes. Returns null
 * rather than guessing when the object can't be read.
 */
export async function readVaultBalance(vaultObjectId: string): Promise<bigint | null> {
  try {
    const res = await suiClient().getObject({ objectId: vaultObjectId, include: { content: true } });
    const bytes = res.object?.content;
    if (!bytes || bytes.length < 40) return null;

    let n = 0n;
    for (let i = 39; i >= 32; i--) n = (n << 8n) | BigInt(bytes[i]);
    return n;
  } catch {
    return null;
  }
}

/**
 * Every spendable SUI coin an address holds, largest first.
 *
 * `fundedGasCoin` returns one, which is fine for a fixed-size call but
 * wrong whenever the amount comes from the address's *total* balance: a
 * sweep computed from `getBalance` (which sums every coin) and then paid
 * from a single coin fails with InsufficientCoinBalance the moment the
 * balance is spread across more than one. Passing all of them as gas
 * payment merges them, so `tx.gas` is the whole balance.
 */
export async function allGasCoins(
  address: string
): Promise<Array<{ objectId: string; version: string; digest: string }>> {
  try {
    const coins = await suiClient().listCoins({ owner: address, coinType: "0x2::sui::SUI" });
    return coins.objects
      .filter((c) => BigInt(c.balance) > 0n)
      .sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)))
      .map((c) => ({ objectId: c.objectId, version: c.version, digest: c.digest }));
  } catch {
    return [];
  }
}
