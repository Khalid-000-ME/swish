import { NextRequest, NextResponse } from "next/server";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { findSubAccount, walletState } from "@/lib/wallet-store";
import { addToAllowlistOnChain, isMintConfigured, removeFromAllowlistOnChain } from "@/lib/mint";
import { toJsonSafe } from "@/lib/json";

/**
 * Clearing a counterparty for an envelope, on purpose rather than as a
 * side effect.
 *
 * Until now the only way onto an allow-list was to approve a payment
 * that had already been caught — which meant the very first payment to
 * every vendor had to interrupt someone, even one the operator already
 * knew they wanted to pay. The panel even had a label for "added by
 * you" that nothing could produce.
 *
 * The chain is the authority here. `execute_declared` asserts
 * `vec_set::contains(&v.allowlist, &recipient)`, so an address added
 * only to the wallet's own copy would abort with E_NOT_ALLOWLISTED the
 * first time an agent tried to use it. If the on-chain write fails, the
 * local one doesn't happen either — a list that disagrees with the
 * chain is worse than one that's missing an entry.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { agentId, subAccountId, address, label } = body as {
    agentId?: string;
    subAccountId?: string;
    address?: string;
    label?: string;
  };

  if (!agentId || !subAccountId || !address) {
    return NextResponse.json(
      { error: "agentId, subAccountId and address are required" },
      { status: 400 }
    );
  }

  if (!isValidSuiAddress(normalizeSuiAddress(address))) {
    return NextResponse.json({ error: `${address} is not a Sui address` }, { status: 400 });
  }
  const normalized = normalizeSuiAddress(address);

  const sub = findSubAccount(agentId, subAccountId);
  if (!sub) return NextResponse.json({ error: "no such envelope" }, { status: 404 });

  if (sub.allowlist.some((a) => a.address === normalized)) {
    return NextResponse.json({ error: "already on this envelope's allow-list" }, { status: 409 });
  }

  // An address the operator has banned outright is not a mistake to be
  // silently overridden by adding it somewhere else.
  if (walletState().bannedAddresses.some((b) => b.address.toLowerCase() === normalized.toLowerCase())) {
    return NextResponse.json(
      { error: "You banned this address. Unban it first if you meant to clear it." },
      { status: 409 }
    );
  }

  let digest: string | undefined;
  if (isMintConfigured() && sub.onChain && sub.vaultObjectId) {
    try {
      ({ digest } = await addToAllowlistOnChain({ vaultObjectId: sub.vaultObjectId, address: normalized }));
    } catch (err) {
      console.error("[bind] on-chain allowlist add failed", err);
      return NextResponse.json(
        {
          error: `The vault would not take this address: ${err instanceof Error ? err.message : err}`,
        },
        { status: 502 }
      );
    }
  }

  sub.allowlist.push({
    address: normalized,
    label: label?.trim() || "Cleared counterparty",
    addedAt: Date.now(),
    addedVia: "manual",
    totalPaidMist: "0",
  });

  return NextResponse.json(toJsonSafe({ added: normalized, onChainDigest: digest }));
}

/** Removing standing permission. Takes effect on chain the same way. */
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { agentId, subAccountId, address } = body as {
    agentId?: string;
    subAccountId?: string;
    address?: string;
  };

  if (!agentId || !subAccountId || !address) {
    return NextResponse.json(
      { error: "agentId, subAccountId and address are required" },
      { status: 400 }
    );
  }

  const sub = findSubAccount(agentId, subAccountId);
  if (!sub) return NextResponse.json({ error: "no such envelope" }, { status: 404 });

  const normalized = normalizeSuiAddress(address);
  if (!sub.allowlist.some((a) => a.address === normalized)) {
    return NextResponse.json({ error: "not on this envelope's allow-list" }, { status: 404 });
  }

  // The vault goes first here too. Dropping it locally while the vault
  // still holds it would leave standing permission on chain that the
  // wallet no longer shows.
  let digest: string | undefined;
  if (isMintConfigured() && sub.onChain && sub.vaultObjectId) {
    try {
      ({ digest } = await removeFromAllowlistOnChain({ vaultObjectId: sub.vaultObjectId, address: normalized }));
    } catch (err) {
      console.error("[bind] on-chain allowlist remove failed", err);
      return NextResponse.json(
        { error: `The vault still holds this address: ${err instanceof Error ? err.message : err}` },
        { status: 502 }
      );
    }
  }

  sub.allowlist = sub.allowlist.filter((a) => a.address !== normalized);
  return NextResponse.json(toJsonSafe({ removed: normalized, onChainDigest: digest }));
}
