import type { DryRunResult } from "@/lib/types";
import { DEMO_ADDRESSES } from "./addresses";

/**
 * Recreates the Bybit-class failure (BIND_PRD.md §11, Villain 1): a
 * transaction whose *display* reads "routine transfer" but whose *actual*
 * effects include an undeclared beneficiary and a capability grant.
 *
 * Used as a labelled fallback DryRunResult when a live
 * devInspectTransactionBlock isn't available (e.g. no funded gas object to
 * reference yet) — see lib/sui.ts `dryRun()`. When gas is available, Swish
 * runs a real multi-command PTB and gets this same shape back from the
 * actual RPC instead of this fixture.
 */
export const DIRTY_PTB_DRY_RUN: DryRunResult = {
  status: "success",
  balanceChanges: [
    { owner: DEMO_ADDRESSES.vault, coinType: "0x2::sui::SUI", amount: -50_000_000_000n },
    { owner: DEMO_ADDRESSES.allowlistedMerchant, coinType: "0x2::sui::SUI", amount: 30_000_000_000n },
    // The part the declaration never mentioned:
    { owner: DEMO_ADDRESSES.attackerEscalation, coinType: "0x2::sui::SUI", amount: 20_000_000_000n },
  ],
  objectChanges: [
    { type: "transferred", objectType: "0x2::coin::Coin<0x2::sui::SUI>", objectId: "0x" + "a1".repeat(32), recipient: DEMO_ADDRESSES.allowlistedMerchant },
    {
      type: "created",
      objectType: "0xbind::escalation::AdminCap",
      objectId: "0x" + "c9".repeat(32),
      recipient: DEMO_ADDRESSES.attackerEscalation,
    },
  ],
  effectsDigest: "0x" + "d1".repeat(32),
};
