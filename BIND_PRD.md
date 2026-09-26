# Bind — Implementation PRD

**The allowance wallet for AI agents.**
*An agent can only spend what it said it would spend it on.*

ETHGlobal Tokyo 2026 · Sponsors applied: **Sui**, **World**, **Intercepta** (3 of 3 slots)
Submission deadline: **Sun 27 Sep 2026, 09:00 JST**

---

## 0. The sentence a judge should repeat to another judge

> "You fund a wallet, hand it to your AI agent, and the agent physically cannot move money in any way it didn't declare in advance — they proved it by replaying the attack that drained the Grok/Bankr wallet twice, live, and it just stopped."

Everything in this document exists to make that sentence true and demonstrable in four minutes.

---

## 1. What this is, and what it deliberately is not

| Bind **is** | Bind is **not** |
|---|---|
| One self-contained app: a vault + an agent + a screen | An SDK, framework, middleware or "platform" |
| A wallet a person funds and hands to an agent | A general-purpose policy engine for anyone's agent |
| Narrow: spend-side only (outflows), one chain, one asset type at MVP | Cross-chain, multi-asset, or a marketplace |
| An end-user product with a face | Infrastructure a sponsor could have built themselves |

**Why narrow matters here:** the sponsors already build primitives. Sui built the object model and dry-run. World built personhood and agent identity. Intercepta built screening. None of them built *the thing a normal person would actually hand money to.* That's the gap Bind fills, and it's the gap that reads as creative rather than derivative.

**One-ended:** Bind has exactly one integration surface — the human who funds it. Nothing needs to adopt Bind for Bind to work. No merchant onboarding, no counterparty cooperation, no protocol buy-in. This is what makes it demoable and shippable in hours, and it is the opposite of every agentic-commerce standard that is stuck waiting on merchant adoption until 2027.

---

## 2. The wound (use these numbers verbatim in the pitch)

**The specific incident Bind is built against:**

- **Grok/Bankr wallet — $330,000 (March 2025), then $175,000 again (May 2026).** Same wallet, twice. An attacker sent an **unsolicited membership NFT** that silently unlocked a higher permission tier, then posted an instruction **encoded in Morse code** as an X reply. The agent decoded it, treated it as a legitimate command, and authorized the transfer.
- **The detail that justifies this entire architecture:** a guardrail against exactly this path *had been built* after the first attack. It **"did not survive a subsequent rewrite... it was not tracked as a permanent requirement, so it disappeared."**
  → *A control that lives in application code will eventually be refactored away. Bind's control lives in the object graph, where a rewrite cannot silently remove it.*

**The same failure at institutional scale:**

- **Bybit — $1.5B, February 2025.** Three security-trained employees approved a display reading "routine transfer." The signature authorized a malicious contract upgrade handing 401,347 ETH to Lazarus Group. Largest theft in crypto history. **Root cause: what was displayed was not bound to what would execute.**

**Why the existing fixes don't close it:**

| Fix attempted | Status | Why the wound stays open |
|---|---|---|
| **ERC-7730 Clear Signing** (Ethereum Foundation, launched 12 May 2026, + $1M audit push; Ledger, Trezor, MetaMask, Fireblocks, WalletConnect) | Shipping | Only works for contracts **with a descriptor in the registry** — at launch 1inch, Aave, Lido, Tether, LiFi, Hyperliquid. Everything else falls back to blind signing. And it makes transactions *readable by a human who is present*. **No human is present when an agent signs.** |
| **ERC-7715 session keys / scoped permissions** | Experimental | A **Quantstamp audit found two high-severity bugs**: spend limits could be drained by exploiting pre-execution hook assumptions about unchanged state across multiple calls; and incorrect storage-key derivation made **all session keys share the same permissions** instead of individual scopes. The bound was the bug. |
| **MetaMask agentic-wallet guidance** (July 2026): rolling 24h outflow caps + per-tx caps + allow-lists | Guidance | A quantity ceiling cannot distinguish *"agent doing its job"* from *"compromised agent doing something job-shaped."* Caps are a blunt answer to a semantics problem. |
| **Visa TAP** (14 Oct 2025, w/ Cloudflare, 12 partners) | Early | Proves *the agent is legitimate*. Says nothing about whether **this transaction matches what the agent claimed it was doing**. Merchant baseline not expected until 2027+. |
| **AP2 / Verifiable Intent** | Early | Academic work names the residual gap directly: *"Signing the Transaction but Not the Decision: Whisper Attacks and a Binding Defense for AP2."* The decision↔signature binding is a known-open problem. |

**The frontier has moved.** Human-facing drainer losses **fell 83%: $494M (2024) → $84M (2025)**; affected wallets 332,000 → 106,106. Meanwhile one AI agent wallet was drained **twice in 14 months** with a fix that evaporated in a refactor. The industry is successfully closing the human attack surface while the agent surface opens.

---

## 3. The mechanism in one page

Three facts, in order:

1. **The agent declares before it acts.** Not prose — a typed `Declaration` object published on-chain: *this vault, this recipient, this asset, at most this amount, expiring at this time, for this stated reason.*
2. **The chain is dry-run before anything is signed.** Sui's `dryRunTransactionBlock` returns the **actual** effects — every balance delta, every object transferred, every capability created, every object deleted. Bind diffs actual effects against the declaration.
3. **Both objects must be consumed together or nothing moves.** Funds leave the vault only via a Move function that takes the `Declaration` **and** a proof object and **destroys both**. Clean diff → backend mints `MatchProof` → auto-executes. Dirty or novel → no `MatchProof` exists, so the path is closed; the only alternative path requires an `OverrideApproval` minted from a **fresh World ID verification of the human**, after **Intercepta** has screened the surprise recipient.

**Why this is not a policy check:** there is no code path in `allowance_vault.move` that moves coins without consuming a proof object. You cannot forget to call the checker, because the checker's output *is the key*. You cannot refactor it away, because removing it removes the ability to spend at all. This is the direct structural answer to the Bankr guardrail that vanished in a rewrite.

---

## 4. Division of labour — what catches what

This section exists because it is the difference between reading as rigorous and reading as hand-waving. **State it out loud in the demo.** Bind is not one check; it is four, and each catches a class the others cannot.

| Attack | Caught by | Mechanism |
|---|---|---|
| Transaction does **more than it says** (Bybit-shaped; swap that also grants an approval or moves an NFT) | **Dry-run diff** | Actual effects ⊄ declaration → no `MatchProof` minted → vault call aborts |
| Payment to a **known-bad address** | **Intercepta** | Live screen before signature; flagged → hard block, no override offered |
| Payment to a **novel address the agent honestly declared** (the injected-instruction case) | **Allow-list + human gate** | Recipient not on vault allow-list → auto-path unavailable → requires fresh World ID override |
| **Permission escalation via unsolicited object** (the Bankr NFT) | **Vault config authority** | Authority derives *only* from `Vault` config, mutable *only* by the World-verified owner. Received objects confer nothing. Escalation is structurally inert. |
| Agent spends **more, or more often, than agreed** | **On-chain envelope** | `per_tx_cap`, rolling `window_spent`, `expires_ms`, single-use declaration — all asserted in Move |

**The honest boundary, stated plainly (and in the demo):** Bind does **not** stop an agent that *honestly declares* a bad intention to an *allow-listed* recipient within caps. Nothing can, short of judging intent. What Bind guarantees is that **every outflow is either exactly what the agent declared to an address you pre-approved, or it stopped and asked you with your face.** That is a claim you can fully defend, and it is strictly stronger than what any shipped system offers today. Saying this before a judge asks is worth more than the feature.

---

## 5. Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ OWNER (human)                                                         │
│  · Creates vault, funds it, sets allow-list + caps  → IDKit verified  │
│  · Approves overrides on demand                     → World ID (Agents)│
└───────────────┬───────────────────────────────────────────────────────┘
                │ owns
┌───────────────▼───────────────────────────────────────────────────────┐
│ SUI (testnet) — the only place authority lives                        │
│  Vault{balance, owner, agent, allowlist, per_tx_cap, window}          │
│  Declaration{vault, recipient, coin, max_amount, expires, reason_hash}│
│  MatchProof{declaration_id, effects_digest}       ← ed25519-verified  │
│  OverrideApproval{declaration_id, effects_digest, nullifier_hash}     │
│  execute_declared(vault, Declaration, MatchProof)     ⟶ consumes both │
│  execute_with_override(vault, Declaration, Override)  ⟶ consumes both │
└───────────────▲───────────────────────────────────────────────────────┘
                │ only the BindExecutor key may submit
┌───────────────┴───────────────────────────────────────────────────────┐
│ BACKEND (holds ExecutorCap + ed25519 attestation key)                 │
│  1. receives Declaration + candidate PTB from agent                   │
│  2. dryRunTransactionBlock → actual effects                           │
│  3. diffEffects(declared, actual) → clean | violations | needs_human   │
│  4. Intercepta screen recipient (always, before any signature)        │
│  5. clean+allowlisted → sign attestation → mint MatchProof → execute  │
│     needs_human      → World ID redirect → validate server-side       │
│                      → sign → mint OverrideApproval → execute         │
│     violation/flagged→ refuse. Nothing is minted. Nothing is signed.  │
└───────────────▲───────────────────────────────────────────────────────┘
                │ proposes only — holds no key, cannot submit
┌───────────────┴───────────────────────────────────────────────────────┐
│ AGENT (LLM, tool-calling)                                             │
│  tools: readVaultState, priceQuote, buildPayment, buildSwap,          │
│         purchaseData(x402), declareIntent                             │
│  · never holds a signing key   · never does arithmetic                │
└──────────────────────────────────────────────────────────────────────┘
```

**Load-bearing test — remove any one and the product dies:**
- Remove **Sui**: no object consumption, so enforcement degrades to a boolean flag someone can refactor away. The entire thesis dies.
- Remove **World**: the override path has no way to know a *human* approved, so the escape hatch becomes a backdoor.
- Remove **Intercepta**: known-bad recipients pass whenever the agent declares them honestly and the human is inattentive.

---

## 6. Sui Move specification

Package: `bind`. Modules: `allowance_vault`, `declaration`, `proofs`. Target: **Sui testnet**.

### 6.1 `allowance_vault.move`

```move
module bind::allowance_vault {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use sui::vec_set::{Self, VecSet};

    const E_NOT_OWNER: u64            = 1;
    const E_WRONG_VAULT: u64          = 2;
    const E_OVER_TX_CAP: u64          = 3;
    const E_OVER_WINDOW_CAP: u64      = 4;
    const E_DECLARATION_EXPIRED: u64  = 5;
    const E_RECIPIENT_MISMATCH: u64   = 6;
    const E_AMOUNT_EXCEEDS_DECL: u64  = 7;
    const E_NOT_ALLOWLISTED: u64      = 8;
    const E_VAULT_FROZEN: u64         = 9;

    /// The only place spending authority exists.
    public struct Vault<phantom T> has key {
        id: UID,
        balance: Balance<T>,
        owner: address,            // World-verified human; only they may reconfigure
        agent: address,            // identity for attribution only — CANNOT spend
        allowlist: VecSet<address>,// auto-path recipients
        per_tx_cap: u64,
        window_ms: u64,            // rolling window length
        window_start_ms: u64,
        window_spent: u64,
        frozen: bool,
    }

    /// Owner-only. Mutating config is the ONLY way authority changes.
    /// Received objects never confer authority — this is what makes the
    /// Bankr "unsolicited NFT escalates permission tier" attack inert.
    public fun set_allowlist<T>(v: &mut Vault<T>, add: vector<address>, ctx: &TxContext) {
        assert!(tx_context::sender(ctx) == v.owner, E_NOT_OWNER);
        /* ... */
    }
    public fun set_caps<T>(v: &mut Vault<T>, per_tx: u64, window_ms: u64, ctx: &TxContext) {
        assert!(tx_context::sender(ctx) == v.owner, E_NOT_OWNER);
        /* ... */
    }
    public fun freeze_vault<T>(v: &mut Vault<T>, ctx: &TxContext) { /* owner-only kill switch */ }

    /// AUTO PATH. Consumes Declaration + MatchProof. Both cease to exist.
    public fun execute_declared<T>(
        v: &mut Vault<T>,
        decl: declaration::Declaration,
        proof: proofs::MatchProof,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(!v.frozen, E_VAULT_FROZEN);

        // destructure == permanent consumption; no flag to forget to clear
        let (d_id, d_vault, d_recipient, d_max, d_expires, _reason) = declaration::consume(decl);
        let (p_decl_id, _effects_digest)                            = proofs::consume_match(proof);

        assert!(p_decl_id == d_id, E_WRONG_VAULT);
        assert!(d_vault == object::id(v), E_WRONG_VAULT);
        assert!(clock::timestamp_ms(clock) <= d_expires, E_DECLARATION_EXPIRED);
        assert!(vec_set::contains(&v.allowlist, &d_recipient), E_NOT_ALLOWLISTED);
        assert!(d_max <= v.per_tx_cap, E_OVER_TX_CAP);

        roll_window(v, clock);
        assert!(v.window_spent + d_max <= window_cap(v), E_OVER_WINDOW_CAP);
        v.window_spent = v.window_spent + d_max;

        let out = coin::from_balance(balance::split(&mut v.balance, d_max), ctx);
        transfer::public_transfer(out, d_recipient);
    }

    /// OVERRIDE PATH. Identical enforcement, except the proof came from a
    /// fresh human World ID verification, and the recipient need not be
    /// allow-listed (a human looked at it).
    public fun execute_with_override<T>(
        v: &mut Vault<T>,
        decl: declaration::Declaration,
        approval: proofs::OverrideApproval,
        clock: &Clock,
        ctx: &mut TxContext,
    ) { /* same asserts, minus E_NOT_ALLOWLISTED */ }
}
```

**Invariant to state in the README:** `Balance<T>` inside `Vault` is reachable by exactly two functions, and both require a proof object that only the backend can mint, and only after a clean dry-run (auto) or a validated human verification (override). There is no third path. `grep` for `balance::split` in the package and you find two call sites.

### 6.2 `declaration.move`

```move
public struct Declaration has key, store {
    id: UID,
    vault_id: ID,
    recipient: address,
    coin_type: vector<u8>,   // ascii type tag, asserted off-chain + logged
    max_amount: u64,
    expires_ms: u64,
    reason_hash: vector<u8>, // keccak(agent's plain-language reason)
    nonce: u64,
}
public fun mint_declaration(cap: &AgentCap, /* fields */, ctx: &mut TxContext): Declaration
public(package) fun consume(d: Declaration): (ID, ID, address, u64, u64, vector<u8>)
```

`AgentCap` is held by the **backend**, not the LLM. The LLM's output is translated into a declaration by deterministic code; the model never signs.

### 6.3 `proofs.move`

```move
public struct MatchProof has key, store {
    id: UID, declaration_id: ID, effects_digest: vector<u8>,
}
public struct OverrideApproval has key, store {
    id: UID, declaration_id: ID, effects_digest: vector<u8>,
    nullifier_hash: vector<u8>,  // World pairwise id, hashed
    verified_at_ms: u64,
}

/// Both minted only against a valid ed25519 signature from the registered
/// Bind attestation key over the canonical message bytes.
public fun mint_match_proof(
    reg: &AttestorRegistry, msg: vector<u8>, sig: vector<u8>, ctx: &mut TxContext
): MatchProof {
    assert!(ed25519::ed25519_verify(&sig, &reg.pubkey, &msg), E_BAD_SIG);
    /* parse msg -> declaration_id, effects_digest */
}
```

Signature verification on-chain means the *chain* decides whether a proof is real, not the backend's own say-so. If the backend is compromised, it can mint proofs — but it still cannot exceed the vault envelope (caps, allow-list, expiry, single-use declaration), and the owner's `freeze_vault` kill switch remains. Say this when asked "what if your backend is hacked."

---

## 7. The dry-run diff (the technical heart)

**API:** `suiClient.dryRunTransactionBlock({ transactionBlock: <base64 TransactionData> })`
**Consume:** `effects.status`, `balanceChanges[]` (`owner`, `coinType`, `amount`), `objectChanges[]` (`type`, `objectType`, `sender`, `recipient`, `objectId`), `events[]`.
`[VERIFY]` exact field names against the installed `@mysten/sui` version in hour 1 — the diff is worthless if a field name is wrong, and it is a five-minute check.

```ts
type Violation =
  | { kind: 'undeclared_beneficiary'; address: string }
  | { kind: 'undeclared_asset'; coinType: string }
  | { kind: 'amount_exceeds'; declared: bigint; actual: bigint }
  | { kind: 'undeclared_object_transfer'; objectId: string; to: string }
  | { kind: 'capability_grant'; objectType: string }
  | { kind: 'object_destruction'; objectId: string }
  | { kind: 'unexpected_publish' }
  | { kind: 'dry_run_failed'; status: string }
  | { kind: 'expired' };

export function diffEffects(decl: Declaration, actual: DryRunResult, vault: VaultState) {
  const violations: Violation[] = [];
  if (actual.effects.status.status !== 'success')
    violations.push({ kind: 'dry_run_failed', status: actual.effects.status.error ?? '?' });

  // 1 — every balance delta must be explained by the declaration
  for (const bc of actual.balanceChanges) {
    const owner = normalizeOwner(bc.owner);
    const amt = BigInt(bc.amount);
    if (owner === vault.id || owner === vault.address) {
      if (bc.coinType !== decl.coinType) violations.push({ kind: 'undeclared_asset', coinType: bc.coinType });
      if (-amt > decl.maxAmount) violations.push({ kind: 'amount_exceeds', declared: decl.maxAmount, actual: -amt });
    } else if (owner === decl.recipient) {
      // expected inflow — fine
    } else if (amt > 0n) {
      violations.push({ kind: 'undeclared_beneficiary', address: owner }); // ← the Bybit class
    }
  }

  // 2 — object movements the declaration never mentioned
  for (const oc of actual.objectChanges) {
    if (oc.type === 'transferred' && vault.controls(oc.objectId) && oc.recipient !== decl.recipient)
      violations.push({ kind: 'undeclared_object_transfer', objectId: oc.objectId, to: oc.recipient });
    if ((oc.type === 'created' || oc.type === 'transferred') && CAP_RE.test(oc.objectType))
      violations.push({ kind: 'capability_grant', objectType: oc.objectType });   // ← the Bankr class
    if (oc.type === 'deleted' && vault.controls(oc.objectId))
      violations.push({ kind: 'object_destruction', objectId: oc.objectId });
    if (oc.type === 'published') violations.push({ kind: 'unexpected_publish' });
  }

  if (Date.now() > decl.expiresMs) violations.push({ kind: 'expired' });

  const needsHuman = !vault.allowlist.includes(decl.recipient);
  return { violations, needsHuman, effectsDigest: sha256(canonicalize(actual)) };
}
```

`const CAP_RE = /(::.*Cap\b|Capability|AdminCap|TreasuryCap|OwnerCap|UpgradeCap)/;`

**Two-tier PTB policy** — this is the part that makes the design coherent, so keep it:

- **Simple payments** (the x402 flow, ordinary transfers): the backend **discards** whatever the agent built and constructs its own canonical minimal PTB containing exactly one command: the vault call. Hidden extra commands are impossible *by construction*.
- **Complex actions** (agent-chosen protocol calls, e.g. a swap): the agent's PTB must be executed as-built, so hidden effects are possible — and this is precisely where the dry-run diff earns its place. A dirty diff means no `MatchProof`, and without one the vault call aborts, which aborts the whole PTB. **The attacker's extra commands cannot execute without the vault call, and the vault call cannot execute without the proof.**

**TOCTOU, disclosed:** state can change between dry-run and execution. Mitigations: declaration expiry ≤ 120s; re-dry-run immediately before submit and abort on any diff change; `effects_digest` recorded in the proof so a post-hoc audit shows exactly what was attested. The residual race window is real and goes in the disclosure register — do not pretend otherwise.

---

## 8. World integration (two tracks, one sponsor slot)

Both World tracks are non-continuity and each pays up to 2 × $2,500. Use **both**, naturally:

**8.1 IDKit — vault creation (Track: Best Use of IDKit).**
The trust moment, stated the way the track asks for it: *"one human, one allowance wallet — before any money goes in."* IDKit verification gates `create_vault`, binding a nullifier to the vault's `owner`, so a single person cannot silently spin up unlimited unaudited agent wallets, and so allow-list changes are attributable to a verified human rather than a key that might be shared. Show the successful verification **and** the alternative path (verification declined → no vault created).

**8.2 World ID for Agents — the override (Track: Best Use of World ID for Agents).**
This is the track's literal journey: *verification request → user completion → validated result → protected agent action.*

- The flow is **OIDC-shaped: a redirect, not the IDKit widget.** `[VERIFY]` the sandbox's exact request/callback shape in hour 1; assuming widget semantics will cost a day you do not have.
- **The callback is validated server-side only.** The frontend never receives anything from which a "verified" state could be forged. This is a hard track requirement, not hygiene.
- On successful validation the backend signs `(declaration_id, effects_digest, keccak(nullifier), timestamp)` with its ed25519 key and calls `mint_override_approval`, verified on-chain via `ed25519_verify`.
- **Denied and expired paths are first-class, not error handling:** human cancels → nothing minted → declaration expires → funds never moved. There is no special-case branch; the absence of the object *is* the denial. Demo both.
- Sandbox proofs use fake identities — the track says so explicitly, and so does your disclosure register.

---

## 9. Intercepta integration (Track 1: Safe Agent-to-Agent Payments with x402, $2,000)

Track requirements, mapped one-to-one:

| Requirement | How Bind satisfies it |
|---|---|
| Working agent payment flow on testnet | Agent buys a paid data feed via x402 to fund its own decision, then pays out from the vault |
| **Live Intercepta call before signing/acceptance** | `screenRecipient()` runs before any signature and before any proof is minted — on **every** path, auto and override alike |
| Mainnet address screening | Screen real mainnet addresses while settlement happens on testnet — **disclose this split explicitly** |
| Demo showing one approved and one blocked payment | Villain 2 (blocked, flagged address) and the happy path (approved) — see §11 |
| Public repo + feedback | `FEEDBACK.md` on API shape, latency, false-positive handling |

**Stand up a real x402-gated endpoint** (a tiny priced `/feed` returning a market datum) so at least one completed paid request exists end-to-end. If time collapses, the endpoint may be your own local service — but then label it as such in the README rather than implying a third party.

**Placement that matters:** Intercepta runs *before signature*, not after. A screen that happens post-broadcast is theatre. Show the call ordering in the architecture diagram.

---

## 10. The agent

**Model:** Claude Sonnet 5 (`claude-sonnet-5`) via the AI SDK, tool-calling.

**Tools, fixed order enforced by the system prompt:**
1. `readVaultState()` — balance, allow-list, caps, remaining window
2. `purchaseData(feed)` — x402 paid call; returns the datum **and** its provenance
3. `computeAmount(...)` — **deterministic TypeScript**. The model never does arithmetic; it calls a pure function, so every number is independently reproducible
4. `declareIntent({recipient, coinType, maxAmount, reason})` — emits the typed declaration
5. `buildTransaction()` — constructs the candidate PTB

**Hard constraints (write these in the system prompt and in the README):**
- The agent holds **no signing key** and **cannot submit a transaction**. Only the backend's `ExecutorCap` can.
- The agent must call `declareIntent` **before** `buildTransaction`. A PTB with no matching declaration is refused by the backend without a dry-run.
- The agent's final message must state, in one plain sentence, what it is about to do and that it cannot do it alone.
- Amounts come only from `computeAmount`. If a number appears in a declaration that the deterministic function did not produce, the backend rejects it.

**Indirect prompt injection is expected, not hypothetical.** Data the agent purchases is untrusted input. The agent may be successfully injected — Bind's claim is not "the agent can't be fooled," it is "a fooled agent still can't move money outside the envelope without your face." Say this; it is much stronger than claiming injection-proofness.

---

## 11. Demo script — 4 minutes, villains first

The ordering is the single highest-leverage decision in the submission. Blocked paths are literal grading criteria for both World and Intercepta, and leading with them is what made the projects you analysed memorable.

**0:00–0:25 — The stake.** "This wallet"— gesture at the real incident — "was drained twice: $330K, then $175K. Same wallet. The fix they built after the first attack disappeared in a code rewrite. Here's a wallet where that can't happen, because the guard isn't code you can delete — it's the only key that opens the door."

**0:25–1:15 — Villain 1: the transaction that does more than it says (Bybit class).**
Agent proposes "swap 100 USDC → SUI." Dry-run panel shows actual effects side by side with the declaration: an **extra transfer to an undeclared address** and a **capability grant**. Plain-language diff appears: *"You said: send 100 USDC to the pool. The chain would actually also: send your NFT to 0xabc… and grant AdminCap to 0xabc…"* → `undeclared_beneficiary`, `capability_grant` → **no MatchProof minted** → vault call aborts. Say: *"Nothing was refused by a policy. There was simply no key."*

**1:15–1:50 — Villain 2: the flagged recipient (Intercepta's required blocked payment).**
Agent honestly declares a payment to a **mainnet-flagged** address. Intercepta returns flagged **before any signature** → hard block, no override offered. *"The agent wasn't lying. It was wrong. Different failure, caught by a different layer."*

**1:50–2:25 — Villain 3: the Bankr escalation.**
Send an unsolicited "membership" object into the vault's address, then deliver an encoded instruction to the agent. Show that the vault's authority reads **only** from its own config: the received object confers nothing, the escalation is inert, and changing the config requires the owner's World verification. *"This is the exact attack, structurally impossible rather than patched."*

**2:25–3:00 — The denied and expired paths (World's required unsuccessful journeys).**
A novel-recipient payment triggers the World ID override. Human **cancels** → no `OverrideApproval` → declaration expires → funds never moved. Show the expiry timer hit zero. *"The denial isn't a branch in the code. It's the absence of an object."*

**3:00–3:40 — The happy path, fast.** Routine allow-listed payment: declaration → clean diff → auto-execute, no human friction. Then one novel payment approved via World ID, executing on consumption of both objects. *"This is why it's usable: the human is only in the loop where the loop was actually novel."*

**3:40–4:00 — The close.** Read the two invariants: *two functions can move money; both destroy their proof; the LLM never held a key.* Then: `grep -n "balance::split" sources/` → two hits. Show it live. A near-empty surface is better evidence than any argument.

---

## 12. Sponsor mapping and prize surface

| Sponsor | Track | Pool | Slots | Why Bind is load-bearing, not decorative |
|---|---|---|---|---|
| **Sui** | DeFi & Payments | $5,000 | 3 (2.5k/1.5k/1k) | `dryRunTransactionBlock` is the detection mechanism and object consumption is the enforcement mechanism. On a chain without consumable objects this design collapses into the refactorable flag that failed at Bankr. Fits "programmable payment systems… move, manage, transform money intelligently" precisely. |
| **World** | Best Use of IDKit | $5,000 | 2 × $2,500 | One verified human per allowance wallet, before funding; declined path shown |
| **World** | Best Use of World ID for Agents | $5,000 | 2 × $2,500 | The override *is* the protected agent action; denied + expired journeys are structural, server-side validation only |
| **Intercepta** | Safe Agent-to-Agent Payments with x402 | $2,000 | 2 (1.25k/750) | Screening runs pre-signature on every path; approved + blocked both demoed; live x402 request completes end-to-end |

**Addressable: ~$17,000 across up to 7 winner slots, 3 sponsor slots, one codebase.**
Note in the README (without applying) that Curvegrid's *Best AI Agent Project* names "policy-aware transaction agents" as an example — evidence of market fit, costing nothing.

---

## 13. Honest disclosure register

Put this in the README as its own section. Voluntary disclosure of limits consistently read as confidence in the projects analysed; discovered undisclosed limits read as overclaiming.

| Item | Disclosure |
|---|---|
| World proofs | Sandbox / **fake identities**; not production-safe. The track states this. |
| Intercepta | Mainnet addresses screened; **settlement on Sui testnet**. Split is deliberate and stated. |
| x402 endpoint | State plainly whether the paid feed is a third-party service or your own labelled local service. |
| Market data | If any feed is synthetic, label the fixture file `*-fixture.ts` and say so in the README. |
| TOCTOU | State changes between dry-run and execution are possible; mitigated by ≤120s expiry and a re-dry-run before submit; residual window acknowledged. |
| Dry-run coverage | The diff sees what Sui's dry-run reports. Effects contingent on state that changes after attestation are out of scope. |
| Honest-declaration limit | Bind does not judge intent. An honestly-declared, allow-listed, in-cap payment executes. See §4. |
| Backend compromise | A compromised backend can mint proofs but cannot exceed caps/allow-list/expiry; owner retains `freeze_vault`. |
| Single asset | MVP is one `Coin<T>` type. Multi-asset is a loop, not a redesign — but it is not built. |

---

## 14. Implementation plan

Hours are wall-clock from start, with a hard cut line. **Nothing below the cut line ships if the spine isn't green.**

### Hour 0 — 0:45 · Resolve the two things that can cost you the event
Do these **first**, in parallel, before writing feature code.
1. `[VERIFY]` **Sui testnet coin type.** Confirm the actual `Coin<T>` you'll use (test USDC vs. `SUI`). One type parameter; everything downstream depends on it. If no stable test stablecoin, use `SUI` and say so.
2. `[VERIFY]` **World ID for Agents request/callback shape.** It is OIDC-shaped, not IDKit. Get one successful redirect + server-side validation round trip logged before building UI.
3. `[VERIFY]` `dryRunTransactionBlock` response field names in your installed SDK version.
4. `[VERIFY]` Intercepta auth header + response schema; find a mainnet address that returns *flagged* and save it as a demo fixture.

### Hours 0:45 — 3:00 · The spine (nothing else matters until this is green)
- `allowance_vault.move`, `declaration.move`, `proofs.move` — publish to testnet
- `execute_declared` end-to-end from a script: mint declaration → mint proof with a real ed25519 sig → coins land at recipient
- **Negative test first:** call `execute_declared` with a proof whose `declaration_id` doesn't match → aborts. Write this test before the happy path.

### Hours 3:00 — 4:30 · The diff
- `diffEffects()` + `dryRunTransactionBlock` wiring
- A deliberately dirty PTB fixture (extra transfer + a `*Cap` creation) that produces two violations. **This fixture is your demo; build it now, not later.**

### Hours 4:30 — 6:00 · Gates
- Intercepta `screenRecipient()` on every path, pre-signature; clean + flagged fixtures
- World ID for Agents: redirect → server-side validation → sign → `mint_override_approval`
- IDKit on `create_vault`

### Hours 6:00 — 7:30 · Agent + x402
- Five tools, fixed order, deterministic `computeAmount`
- The x402 paid `/feed` call, completing one real paid request
- One seeded injected payload in the feed response, for Villain 3

### Hours 7:30 — 9:00 · UI (one screen)
- Left: the agent's declaration in plain language. Right: actual dry-run effects. Middle: the diff, in sentences.
- States: `clean → auto-executed` · `violations → blocked` · `needs_human → World ID` · `flagged → hard blocked` · `expired`
- The diff must read as English, not JSON. *"You said X. The chain would actually also do Y."* This is the line judges quote.

### ▲ CUT LINE ▲ — everything above ships or you have no submission

### Hours 9:00 — 10:30 · Submission artefacts (do not compress these)
- **Demo video ≤ 4 min**, villains first, per §11. Record it twice; keep the second.
- `README.md`: one-sentence summary, the two incident numbers, architecture diagram, the invariant + `grep` evidence, disclosure register, setup steps
- `FEEDBACK.md`: Intercepta API notes; World docs/portal/edge-case feedback (**required** by both World tracks)
- Commit history: incremental, meaningful messages. 1inch explicitly penalises single-commit repos and others read it as a signal — commit as you go from hour zero.

### Dropped without hesitation if time runs short
Multi-asset · dashboards/analytics · swap path (demo payments only; keep the dirty-PTB fixture for the diff) · agent memory/persistence · mobile polish · any second chain.

---

## 15. Repo layout

```
bind/
├── move/sources/{allowance_vault,declaration,proofs}.move
├── move/tests/negative_paths.move        # write these FIRST
├── app/
│   ├── api/declare/route.ts              # receive declaration + candidate PTB
│   ├── api/execute/route.ts              # dry-run → diff → screen → mint → submit
│   ├── api/world/callback/route.ts       # server-side ONLY
│   └── page.tsx                          # the one screen
├── lib/{diff.ts,dryrun.ts,intercepta.ts,world.ts,attest.ts,amount.ts}
├── agent/{tools.ts,prompt.ts}
├── x402/feed.ts                          # the paid endpoint
├── fixtures/{dirty-ptb.ts,flagged-address.ts,injected-feed.ts}
├── README.md   FEEDBACK.md
```

```bash
SUI_NETWORK=testnet
BIND_PACKAGE_ID=
BIND_EXECUTOR_KEY=        # ExecutorCap holder — never in the client bundle
BIND_ATTEST_PRIVKEY=      # ed25519; pubkey registered on-chain
WORLD_APP_ID=  WORLD_ACTION_ID=  WORLD_CLIENT_SECRET=
INTERCEPTA_API_KEY=
ANTHROPIC_API_KEY=
```

---

## 16. Submission checklist (literal track requirements)

- [ ] Public repo, open source, meaningful commit history
- [ ] Demo video ≤ 4 min — **blocked paths shown before the happy path**
- [ ] README: one-sentence summary, team, setup, architecture diagram, disclosure register
- [ ] `FEEDBACK.md` — World (docs, portal, testing, edge cases) **and** Intercepta
- [ ] World: successful verification **and** declined/expired paths, both visible
- [ ] World: callback validated **server-side only** — state this explicitly in the README
- [ ] Intercepta: live pre-signature call, mainnet screening, **one approved + one blocked payment**
- [ ] x402: at least one completed paid request end-to-end
- [ ] Sui: deployed on testnet, package ID in README, on-chain execution shown
- [ ] Exactly 3 sponsors selected: Sui, World, Intercepta (World counts once, covers 2 tracks)

---

## 17. Risk register

| Risk | Probability | Fallback |
|---|---|---|
| World ID for Agents sandbox shape differs from assumption | High | Hour-0 verification; fall back to IDKit-only for the override and **say so** — one World track instead of two |
| Sui testnet stablecoin unavailable | Medium | Use `SUI` as `Coin<T>`; disclose |
| Intercepta returns nothing flagged for your test address | Medium | Bank a known-flagged mainnet address in hour 0 as a fixture |
| Move debugging eats the clock | High | The spine is three small modules; if `execute_with_override` is failing at hour 6, ship auto-path + block-path only and cut the override demo beat |
| Dry-run field names wrong | Low | Hour-0 check |
| Demo recording rushed | **Highest** | Hard-reserve 90 minutes. An unrecorded working project scores zero. |

---

## 18. The three lines to rehearse until they're automatic

1. *"The guard isn't a check you can forget to call — it's the only key that opens the door. Two functions can move money, and both destroy their proof."*
2. *"The agent can absolutely be fooled. It still can't move money outside what it declared to an address you pre-approved, without your face."*
3. *"After the first $330K attack they built exactly this guardrail. It disappeared in a rewrite. Ours can't, because deleting it deletes the ability to spend."*
