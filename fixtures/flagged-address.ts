import { DEMO_ADDRESSES } from "./addresses";

/**
 * Disclosed mock screening list (see lib/intercepta.ts). In live mode this
 * entire file is bypassed in favour of a real Intercepta API response.
 * Keys are lowercase addresses.
 */
export const FLAGGED_ADDRESSES: Record<string, string> = {
  [DEMO_ADDRESSES.flaggedScam.toLowerCase()]:
    "Address clustered with a known drainer-kit deployment; flagged by 3 independent reporters in the last 30 days.",
};
