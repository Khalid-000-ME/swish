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

- **This one cost real time and deserves top billing**: the public testnet fullnode
  (`fullnode.testnet.sui.io:443`) has fully retired JSON-RPC — every method, including
  `sui_getChainIdentifier`, now 404s with "Method not found... migrate to gRPC or GraphQL." We'd
  built our entire chain adapter against `@mysten/sui/jsonRpc`'s `SuiJsonRpcClient` (its own
  package docs only say "deprecated," not "will actually stop responding"), and only discovered
  this once we finally had funded testnet gas to test against — `sui client gas` kept working the
  whole time because the CLI already talks gRPC, which masked the problem. Migrating to
  `SuiGrpcClient` (`simulateTransaction` in place of `devInspectTransactionBlock`/
  `dryRunTransactionBlock`) was a same-day fix once identified, but the deprecation notice reading
  as routine sunset language rather than "already fully off" cost us real build time. Strongly
  recommend the docs (and the JSON-RPC error message's own migration link) say plainly that public
  fullnode JSON-RPC access is *gone*, not *deprecated*.
- Relatedly: `SuiGrpcClient`'s constructor needs an explicit `baseUrl` — passing only `{network:
  'testnet'}` fails with an opaque `Cannot read properties of undefined (reading 'endsWith')`
  rather than a clear "baseUrl is required" error. A friendlier failure mode (or a
  `getGrpcFullnodeUrl(network)` helper mirroring the JSON-RPC client's `getJsonRpcFullnodeUrl`)
  would have saved a debugging pass.
- `simulateTransaction`'s unified `include: {balanceChanges, effects, objectTypes}` response shape
  is a genuinely good design — once we found the right transport, it gave us exactly the
  pre-computed diff surface we needed, arguably cleaner than JSON-RPC's equivalent since it's one
  consistent shape across gRPC/GraphQL/JSON-RPC transports (`SuiClientTypes`) rather than three
  different response formats.
- One real gotcha in our own usage worth flagging in case others hit it: running several
  `signAndExecuteTransaction` calls back-to-back against the same address (all paying gas from the
  same coin) intermittently failed with "object ... is unavailable for consumption, current
  version: ..." — a real object-version race between our own sequential calls. Explicitly waiting
  for each transaction (`waitForTransaction({result})`) and re-fetching the gas coin fresh before
  building the next transaction (rather than relying on the SDK's automatic gas resolution/caching
  across calls) fixed it. A note in the docs about this pattern for scripts/backends issuing
  multiple sequential transactions from one address would help.
- `devInspectTransactionBlock`/`simulateTransaction` not requiring a funded gas object to at least
  *attempt* a call (only `signAndExecuteTransaction` truly needs balance) is the right design for
  what we needed — it's the reason the diff mechanism could be built and reasoned about even while
  testnet faucet access was rate-limited for most of the build window.
