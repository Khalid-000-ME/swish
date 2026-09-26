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
