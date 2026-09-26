import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import type { BalanceChange, DryRunResult, ObjectChange } from "./types";

/**
 * Chain adapter. Uses the (deprecated-but-still-fully-served) JSON-RPC
 * client because `dryRunTransactionBlock` returns friendly, pre-computed
 * `balanceChanges`/`objectChanges` arrays — exactly the shape BIND_PRD.md
 * §7 diffs against. The gRPC/GraphQL clients are the forward-looking
 * replacement; noted here so the choice reads as deliberate, not dated.
 */
const NETWORK = (process.env.SUI_NETWORK as "testnet" | "mainnet" | "devnet") ?? "testnet";

let _client: SuiJsonRpcClient | null = null;
export function suiClient(): SuiJsonRpcClient {
  if (!_client) {
    _client = new SuiJsonRpcClient({ network: NETWORK, url: getJsonRpcFullnodeUrl(NETWORK) });
  }
  return _client;
}

export const BIND_PACKAGE_ID = process.env.BIND_PACKAGE_ID || null;

function normalizeOwner(owner: unknown): string {
  if (typeof owner === "string") return owner; // "Immutable"
  if (owner && typeof owner === "object") {
    const o = owner as Record<string, unknown>;
    if (typeof o.AddressOwner === "string") return o.AddressOwner;
    if (typeof o.ObjectOwner === "string") return o.ObjectOwner;
    if (o.Shared) return "shared";
    if (o.ConsensusAddressOwner && typeof (o.ConsensusAddressOwner as { owner?: string }).owner === "string") {
      return (o.ConsensusAddressOwner as { owner: string }).owner;
    }
  }
  return "unknown";
}

/** Does `address` own at least one real SUI coin we can pay gas with? */
export async function fundedGasCoin(address: string): Promise<{ objectId: string; version: string; digest: string } | null> {
  try {
    const coins = await suiClient().getCoins({ owner: address, coinType: "0x2::sui::SUI" });
    const spendable = coins.data.find((c) => BigInt(c.balance) > 0n);
    if (!spendable) return null;
    return { objectId: spendable.coinObjectId, version: spendable.version, digest: spendable.digest };
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

/**
 * Real dry-run against testnet when the sender owns gas; otherwise returns
 * null so the caller can fall back to a disclosed, labelled fixture. This
 * is the only place "do we actually have chain access right now" is decided.
 */
export async function dryRun(tx: Transaction, sender: string): Promise<DryRunResult | null> {
  const gas = await fundedGasCoin(sender);
  if (!gas) return null;

  tx.setGasPayment([{ objectId: gas.objectId, version: gas.version, digest: gas.digest }]);
  tx.setGasBudget(50_000_000n);

  const client = suiClient();
  const bytes = await tx.build({ client });
  const resp = await client.dryRunTransactionBlock({ transactionBlock: bytes });

  const balanceChanges: BalanceChange[] = resp.balanceChanges.map((b) => ({
    owner: normalizeOwner(b.owner),
    coinType: b.coinType,
    amount: BigInt(b.amount),
  }));

  const objectChanges: ObjectChange[] = resp.objectChanges.map((oc) => {
    const base = { objectId: "objectId" in oc ? oc.objectId : undefined, objectType: "objectType" in oc ? oc.objectType : undefined };
    if (oc.type === "transferred") return { ...base, type: "transferred", recipient: normalizeOwner(oc.recipient) };
    if (oc.type === "created") return { ...base, type: "created", recipient: normalizeOwner(oc.owner) };
    if (oc.type === "deleted") return { ...base, type: "deleted" };
    if (oc.type === "published") return { type: "published" };
    return { ...base, type: "mutated" };
  });

  const status = resp.effects.status?.status === "success" ? "success" : "failure";
  const error = resp.effects.status && "error" in resp.effects.status ? resp.effects.status.error : undefined;

  return {
    status,
    error,
    balanceChanges,
    objectChanges,
    effectsDigest: resp.effects.transactionDigest ?? "0x" + "0".repeat(64),
  };
}

export function isLiveChainConfigured(): boolean {
  return Boolean(BIND_PACKAGE_ID);
}
