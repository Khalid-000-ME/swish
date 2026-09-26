import type { Intercepta } from "./types";

/**
 * Intercepta (formerly Web3Antivirus) transaction scanning.
 *
 * Worth being precise about what this API actually is, because it shapes
 * where it belongs in this system: it is an **EVM/Solana transaction
 * scanner**, not a chain-agnostic address reputation lookup. You hand it
 * a transaction (`from`/`to`/`value`/`data`) plus a `chainId`, and it
 * returns a risk score, a risk group, and a list of detectors —
 * WALLET_DRAINER, MALICIOUS_ADDRESS, RUG_PULL and friends.
 *
 * So it screens the x402 payment leg, which runs on Base Sepolia, before
 * the agent signs it — which is exactly the placement its own track
 * asks for. It does *not* screen the Sui vault payment, because Sui
 * isn't a chain this API supports, and pretending otherwise by feeding a
 * 32-byte Sui address into an EVM endpoint would be theatre.
 *
 * Docs: https://docs.web3antivirus.io/reference/scan-transaction
 */

const ENDPOINT = "https://api.web3antivirus.io/api/public/v1/extension/simulation/transaction";

/** Chains this API can actually scan. Base Sepolia is the x402 leg. */
export const SCANNABLE_CHAIN_IDS = {
  ethereum: 1,
  base: 8453,
  baseSepolia: 84532,
} as const;

export interface Detector {
  code: string;
  description: string;
}

export interface InterceptaScan {
  /** False when the chain isn't one this API supports (e.g. Sui). */
  supported: boolean;
  flagged: boolean;
  riskScore: number;
  riskGroup?: string;
  detectors: Detector[];
  reason?: string;
  source: "live" | "unconfigured" | "unsupported_chain" | "error";
}

/** Detector codes that mean "do not sign this", regardless of score. */
const HARD_FAIL = new Set([
  "WALLET_DRAINER",
  "MALICIOUS_ADDRESS",
  "RUG_PULL",
  "SCAM_TOKEN",
  "PHISHING_SWAP",
  "OWNERSHIP_TRANSFER",
]);

function isFlagged(riskGroup: string | undefined, riskScore: number, detectors: Detector[]): boolean {
  if (detectors.some((d) => HARD_FAIL.has(d.code) || d.code.startsWith("HONEYPOT_SCAM"))) return true;
  const group = (riskGroup ?? "").toLowerCase();
  if (group === "high" || group === "critical") return true;
  return riskScore >= 70;
}

export interface EvmTransactionInput {
  chainId: number;
  from: string;
  to: string;
  /** wei, as a decimal or 0x string */
  value?: string;
  data?: string;
  gas?: string;
  gasPrice?: string;
}

/**
 * Scans a real EVM transaction before it is signed. A failed scan is
 * treated as flagged, never as a silent pass — an outage must not
 * become an open door.
 */
export async function scanEvmTransaction(input: EvmTransactionInput): Promise<InterceptaScan> {
  const apiKey = process.env.INTERCEPTA_API_KEY;

  if (!apiKey) {
    return {
      supported: true,
      flagged: false,
      riskScore: 0,
      detectors: [],
      reason: "INTERCEPTA_API_KEY is not set — no scan was performed.",
      source: "unconfigured",
    };
  }

  try {
    const res = await fetch(`${ENDPOINT}?chainId=${input.chainId}`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-API-KEY": apiKey },
      body: JSON.stringify({
        transaction: {
          from: input.from,
          to: input.to,
          value: input.value ?? "0",
          data: input.data ?? "0x",
          gas: input.gas ?? "0x5208",
          gasPrice: input.gasPrice ?? "0x0",
          type: "0x2",
        },
        mode: "full",
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        supported: true,
        flagged: true,
        riskScore: 100,
        detectors: [],
        reason: `Intercepta returned ${res.status}. Treating as unsafe rather than passing it through. ${body.slice(0, 160)}`,
        source: "error",
      };
    }

    const data = (await res.json()) as {
      riskScore?: number;
      riskGroup?: string;
      detectors?: Detector[];
      transactionType?: string;
    };

    const detectors = data.detectors ?? [];
    const riskScore = typeof data.riskScore === "number" ? data.riskScore : 0;
    const flagged = isFlagged(data.riskGroup, riskScore, detectors);

    return {
      supported: true,
      flagged,
      riskScore,
      riskGroup: data.riskGroup,
      detectors,
      reason: flagged
        ? detectors.map((d) => d.description || d.code).join(" · ") ||
          `Risk group ${data.riskGroup ?? "unknown"} (${riskScore}/100).`
        : undefined,
      source: "live",
    };
  } catch (e) {
    return {
      supported: true,
      flagged: true,
      riskScore: 100,
      detectors: [],
      reason: `Intercepta scan failed: ${e instanceof Error ? e.message : String(e)}. Treating as unsafe.`,
      source: "error",
    };
  }
}

/**
 * The Sui side. Intercepta has no Sui coverage, so rather than invent a
 * verdict this reports honestly that no screen was possible — the diff
 * engine, the envelope's allow-list and the human gate are what stand
 * between a Sui payment and the vault, and the UI says so.
 */
export async function screenRecipient(address: string): Promise<Intercepta> {
  return {
    address,
    flagged: false,
    riskScore: 0,
    reason: "Sui isn't a chain Intercepta scans — this payment is gated by the diff, the allow-list and your approval instead.",
    source: "unsupported",
  };
}
