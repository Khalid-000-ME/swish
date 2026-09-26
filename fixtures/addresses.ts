/**
 * Deterministic demo addresses: sha256("bind:<name>"), so anyone can
 * regenerate and verify these are not hand-picked to look convenient.
 *   node -e "console.log('0x'+require('crypto').createHash('sha256').update('bind:owner').digest('hex'))"
 */
export const DEMO_ADDRESSES = {
  owner: "0x91ffd29a154779ddb7479859f839a111f17bf0da898eb6f60626c9a5682a91b8",
  agent: "0x00202b776710f40065401563ab28609636ebdb6e9e9644f3312c225c5aee1d78",
  vault: "0xf09408abf30c2fd1b45493310fb3625d8887e1135ae093eca1c6e5355c5c9be8",
  allowlistedMerchant: "0xa24a020da022ca0f256400b9fa19223593b81517399dd9fd1239fd7113d2d38a",
  flaggedScam: "0x3e698dbc28df57c43f7917b51205a303e59a0a82767bd1d60a9693490d8c6a33",
  novelMerchant: "0xd59aa838c0885637685d50728dff7c2b2e19e58aba541d03216a67b2f827d1c1",
  attackerEscalation: "0xeb7fb600943ce1079e45c220e27ea15b23fedc02669946bd9d9d6f8d1f1e0889",
} as const;

/**
 * EVM payout addresses for the counterparties an agent pays.
 *
 * Intercepta scans EVM/Solana mainnets only — no testnets — so the
 * counterparty's *mainnet* payout address is what gets screened before
 * the agent signs, which is exactly the pattern its own track describes
 * ("mainnet address screening" while settlement happens elsewhere).
 *
 * The flagged one is not invented: 0x4766…86E2 is the Bybit/Lazarus
 * exploiter address, and Intercepta returns riskScore 90 / High /
 * MALICIOUS_ADDRESS for it live. It is the same $1.5B incident this
 * whole project is built against, which makes the blocked path real
 * rather than staged.
 */
export const COUNTERPARTY_EVM = {
  /** Ordinary vendor — Intercepta returns Low / no detectors. */
  heliosData: "0x7F367cC41522cE07553e823bf3be79A889DEbe1B",
  /** Bybit / Lazarus exploiter — genuinely flagged by Intercepta. */
  knownMalicious: "0x47666Fab8bd0Ac7003bce3f5C3585383F09486E2",
  /** A second genuinely-flagged address, kept for variety. */
  knownMaliciousAlt: "0x098B716B8Aaf21512996dC57EB0615e2383E2f96",
} as const;

/** A funded mainnet address used only as the `from` in scan requests —
 *  the scan needs a plausible sender, and nothing is ever signed. */
export const SCAN_FROM_EVM = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
