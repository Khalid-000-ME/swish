/**
 * Explorer links for everything the wallet shows on-chain. An address or
 * a digest that isn't clickable is just noise — if we're going to print
 * 64 hex characters at someone, they should be able to go look at it.
 */
const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet";

const BASE = `https://suiscan.xyz/${NETWORK}`;

export type ExplorerKind = "address" | "object" | "tx";

export function explorerUrl(kind: ExplorerKind, value: string): string {
  const v = value.trim();
  switch (kind) {
    case "address":
      return `${BASE}/account/${v}`;
    case "object":
      return `${BASE}/object/${v}`;
    case "tx":
      return `${BASE}/tx/${v}`;
  }
}

/**
 * Sui object IDs and account addresses are both 32-byte hex, so they're
 * indistinguishable by shape. Transaction digests are base58 and never
 * 0x-prefixed — that we *can* tell apart, which is enough to stop us
 * linking a digest to an address page.
 */
export function guessKind(value: string): ExplorerKind {
  return value.startsWith("0x") ? "address" : "tx";
}
