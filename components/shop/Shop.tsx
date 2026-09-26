"use client";

import { useState } from "react";
import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { DEMO_ADDRESSES } from "@/fixtures/addresses";

/**
 * Feed Market — a storefront for the demo.
 *
 * Nothing here knows about Swish. It builds an ordinary Sui transaction
 * and asks the connected wallet to sign and execute it, exactly as any
 * dApp would. What makes the demo work is that three of these purchases
 * are refused, and the refusal arrives as an error from the wallet with
 * the reasons attached — the shop only learns it wasn't allowed, not
 * how the wallet decided.
 */

const MIST = 1_000_000_000;

interface Product {
  id: string;
  name: string;
  vendor: string;
  blurb: string;
  priceSui: number;
  /** Where the money would go. */
  payTo: string;
  accent: string;
}

const PRODUCTS: Product[] = [
  {
    id: "daily-feed",
    name: "Daily market feed",
    vendor: "Helios Data Co.",
    blurb: "One day of pricing data. The vendor your agent already buys from.",
    priceSui: 0.02,
    payTo: DEMO_ADDRESSES.allowlistedMerchant,
    accent: "#4f7bf0",
  },
  {
    id: "archive",
    name: "Ten-year archive",
    vendor: "Helios Data Co.",
    blurb: "Same trusted vendor — but a much larger invoice.",
    priceSui: 0.4,
    payTo: DEMO_ADDRESSES.allowlistedMerchant,
    accent: "#f5b942",
  },
  {
    id: "alt-feed",
    name: "Alt-data bundle",
    vendor: "Novi Signals",
    blurb: "A vendor your agent has never paid before.",
    priceSui: 0.02,
    payTo: DEMO_ADDRESSES.novelMerchant,
    accent: "#c084fc",
  },
];

type Outcome =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "paid"; digest: string }
  | { kind: "refused"; message: string };

/**
 * The shop broadcasts the signed transaction from its own backend.
 *
 * dapp-kit's default would submit it in the browser through its
 * JSON-RPC client, which the public fullnode has retired. The wallet's
 * job ended at the signature either way — this is the shop's side of
 * the handoff, and it works with any Sui wallet.
 */
async function broadcast({ bytes, signature }: { bytes: string; signature: string }) {
  const res = await fetch("/api/shop/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bytes, signature }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "The shop could not submit your payment.");
  return { digest: body.digest as string, bytes, signature, effects: "" };
}

export function Shop() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction({ execute: broadcast });
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});

  async function buy(product: Product) {
    if (!account) return;
    setOutcomes((o) => ({ ...o, [product.id]: { kind: "working" } }));

    try {
      // An entirely ordinary transaction. The shop has no idea what the
      // wallet will make of it.
      const tx = new Transaction();
      tx.setSender(account.address);
      const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(BigInt(Math.round(product.priceSui * MIST)))]);
      tx.transferObjects([coin], tx.pure.address(product.payTo));

      const result = await signAndExecute({ transaction: tx });
      setOutcomes((o) => ({ ...o, [product.id]: { kind: "paid", digest: result.digest } }));
    } catch (err) {
      setOutcomes((o) => ({
        ...o,
        [product.id]: { kind: "refused", message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }

  return (
    <main className="min-h-dvh bg-[#0b0c10] text-[#eef1fb]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <div>
            <div className="font-display text-xl text-white">Feed Market</div>
            <div className="text-[11px] text-white/40">Market data, sold by the day</div>
          </div>
          <ConnectButton connectText="Connect wallet" />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10">
        {!account ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center">
            <h1 className="font-display text-3xl text-white">Let your agent do the shopping</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/50">
              Connect a wallet and buy a feed. If you connect Swish, you&apos;re connecting an agent
              rather than an account — and some of these purchases will be refused.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="text-[13px] text-white/70">
                Buying as <span className="font-mono text-white/90">{account.address.slice(0, 10)}…{account.address.slice(-6)}</span>
              </span>
              {account.label && <span className="ml-auto text-[11px] text-white/40">{account.label}</span>}
            </div>

            <div className="space-y-3">
              {PRODUCTS.map((p) => {
                const outcome = outcomes[p.id] ?? { kind: "idle" as const };
                return (
                  <article
                    key={p.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: p.accent }} />
                          <h2 className="text-[15px] font-medium text-white">{p.name}</h2>
                        </div>
                        <div className="mt-1 text-[12px] text-white/40">{p.vendor}</div>
                        <p className="mt-2 max-w-sm text-[13px] leading-snug text-white/55">{p.blurb}</p>
                      </div>

                      <div className="flex flex-none flex-col items-end gap-2">
                        <div className="font-display text-2xl text-white">{p.priceSui} SUI</div>
                        <button
                          disabled={outcome.kind === "working"}
                          onClick={() => buy(p)}
                          className="rounded-full bg-white px-5 py-2 text-[13px] font-semibold text-[#0b0c10] transition hover:bg-white/90 disabled:opacity-40"
                        >
                          {outcome.kind === "working" ? "Asking your wallet…" : "Buy"}
                        </button>
                      </div>
                    </div>

                    {outcome.kind === "paid" && (
                      <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3">
                        <div className="text-[13px] font-medium text-emerald-300">Paid</div>
                        <a
                          href={`https://suiscan.xyz/testnet/tx/${outcome.digest}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block font-mono text-[11px] text-emerald-300/70 underline underline-offset-2"
                        >
                          {outcome.digest.slice(0, 24)}…
                        </a>
                      </div>
                    )}

                    {outcome.kind === "refused" && (
                      <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3">
                        <div className="text-[13px] font-medium text-rose-300">
                          Your wallet refused this purchase
                        </div>
                        <p className="mt-1 text-[12px] leading-snug text-rose-200/70">{outcome.message}</p>
                        <p className="mt-2 text-[11px] text-white/35">
                          The shop doesn&apos;t know why — only that it wasn&apos;t allowed.
                        </p>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            <p className="mt-8 text-center text-[11px] leading-relaxed text-white/30">
              Every purchase here is a real Sui transaction. Swish simulates each one before signing and
              compares what it would actually do against what you allowed.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
