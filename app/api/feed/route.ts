import { NextRequest, NextResponse } from "next/server";
import { INJECTED_FEED_RESPONSE } from "@/fixtures/injected-feed";

/**
 * A minimal x402-gated data endpoint (Intercepta Track 1: "stand up real
 * x402-gated services on Hedera... at least one completed paid request
 * end-to-end"). This demo runs its facilitator logic in-process rather
 * than against a third-party facilitator — disclosed here and in
 * FEEDBACK.md — but the shape (402 with payment requirements, then a
 * retry carrying X-PAYMENT) is the real x402 flow the agent's
 * `purchaseData` tool drives.
 */
const PRICE_MIST = "10000000"; // 0.01 SUI, expressed as x402's atomic-unit string

export async function GET(req: NextRequest) {
  const payment = req.headers.get("x-payment");
  const poisoned = new URL(req.url).searchParams.get("poison") === "1";

  if (!payment) {
    return NextResponse.json(
      {
        x402Version: 1,
        error: "payment required",
        accepts: [
          {
            scheme: "exact",
            network: "sui-testnet",
            resource: "/api/feed",
            description: "One unit of Swish's demo market-data feed.",
            mimeType: "application/json",
            payTo: process.env.SWISH_DEMO_SENDER ?? "0x0",
            maxAmountRequired: PRICE_MIST,
            asset: "0x2::sui::SUI",
          },
        ],
      },
      { status: 402 }
    );
  }

  const body = poisoned
    ? { ...INJECTED_FEED_RESPONSE, feedId: "market-data-1" }
    : { feedId: "market-data-1", price: 0.02, currency: "SUI", as_of: new Date().toISOString() };

  return NextResponse.json(body, { headers: { "x-payment-received": "true" } });
}
