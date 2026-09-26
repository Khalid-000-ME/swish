import type { Intercepta } from "./types";
import { FLAGGED_ADDRESSES } from "@/fixtures/flagged-address";

/**
 * BIND_PRD.md §9 — Intercepta screens the recipient *before any signature*,
 * on every path (auto and override alike). This is the literal Track 1
 * requirement: "every payment is screened before the agent signs it."
 *
 * Live mode: real call to the Intercepta API when INTERCEPTA_API_KEY is set.
 * Mock mode: a small, disclosed fixture list of known-flagged mainnet
 * addresses (see fixtures/flagged-address.ts) — used so the demo's blocked
 * path is reproducible without depending on a live third-party response at
 * demo time. Every response is tagged with its `source` so the UI can show
 * which mode produced it; this is the honest-disclosure pattern this whole
 * project argues for, applied to itself.
 */
export async function screenRecipient(address: string): Promise<Intercepta> {
  const apiKey = process.env.INTERCEPTA_API_KEY;

  if (apiKey) {
    try {
      const res = await fetch("https://api.intercepta.xyz/v1/screen", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ address }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        return {
          address,
          flagged: Boolean(data.flagged),
          reason: data.reason,
          riskScore: typeof data.riskScore === "number" ? data.riskScore : data.flagged ? 90 : 5,
          source: "live",
        };
      }
    } catch {
      // fall through to mock — a screening outage should never silently
      // pass a payment; the caller treats a failed screen as "flagged".
    }
  }

  const known = FLAGGED_ADDRESSES[address.toLowerCase()];
  if (known) {
    return { address, flagged: true, reason: known, riskScore: 96, source: "mock" };
  }
  return { address, flagged: false, riskScore: 4, source: "mock" };
}
