# Sponsor feedback

## World (IDKit + World ID for Agents)

- **Docs**: the split between IDKit (widget) and World ID for Agents (OIDC redirect) took a
  moment to locate — a single comparison page ("which one am I integrating") up front would have
  saved the first hour. Once found, the request/callback shape was clear.
- **Portal**: registering a sandbox app for World ID for Agents specifically (not IDKit) wasn't
  obviously discoverable from the main developer portal landing page.
- **Testing**: the explicit note that sandbox proofs use fake identities is exactly the right kind
  of disclosure — more sponsors should do this. It made it easy to build honestly (see our own
  disclosure register in README.md) instead of pretending a sandbox flow was production-real.
- **Edge case worth documenting**: what should happen, contract-wise, when the OIDC `state`
  param's corresponding pending action has already expired by the time the callback lands? We
  treat this as "no object ever gets minted" on our side, but a canonical recommendation from
  World's own docs would help every integrator converge on the same safe default.
- Requested feature: a one-line curl-able sandbox "deny" simulator (mirroring how easy "approve"
  is to simulate) so the denied-path UX can be built and demoed without a browser round trip.

## Intercepta (Safe Agent-to-Agent Payments with x402)

- **API**: the screening endpoint's shape was easy to integrate against — a single POST with an
  address, a boolean back. Very little friction.
- **What would help**: a documented "known-flagged" test address on testnet/sandbox that always
  returns `flagged: true` deterministically, so integrators can build and demo the blocked-path
  UI without needing a live match against real threat intel (we built our own disclosed fixture
  list for this — `fixtures/flagged-address.ts` — but a first-party one would remove the need).
- **Placement guidance we'd love documented explicitly**: the track description mentions screening
  "before the agent signs it or the service accepts it" — worth being explicit in the docs that
  screening a *changed* payout account (not just a first-time one) is a materially different and
  arguably more important case than screening a brand-new address, since account-swap fraud (the
  business-email-compromise pattern) is the single largest-dollar-loss fraud category in the
  industry. We'd love to see an example in the docs built around that scenario specifically rather
  than a generic "is this address bad" framing.
- Our x402 endpoint (`app/api/feed/route.ts`) implements the 402 → retry-with-`X-PAYMENT` round
  trip in-process rather than against Intercepta's/a third party's facilitator — disclosed in
  README.md. A minimal reference facilitator (even a hosted sandbox one) would have let us wire a
  real one in the time available.

## Sui

- `devInspectTransactionBlock` not requiring a funded gas object (unlike `dryRunTransactionBlock`,
  which needs a real gas coin reference even though gas isn't charged) is exactly the right design
  for what we needed — it's the reason the diff mechanism could be built and reasoned about even
  while testnet faucet access was rate-limited for the whole build window.
- Minor docs gap we hit: the JSON-RPC client (`@mysten/sui/jsonRpc`) is marked deprecated in favor
  of `SuiGrpcClient`/`SuiGraphQLClient`, but `dryRunTransactionBlock`'s convenient pre-computed
  `balanceChanges`/`objectChanges` arrays don't appear to have an equivalent on the gRPC client
  yet (or if they do, we couldn't find it documented) — meaning the "recommended" path currently
  requires reconstructing what JSON-RPC gives you for free. Worth either back-porting that
  convenience or documenting the gRPC equivalent explicitly.
