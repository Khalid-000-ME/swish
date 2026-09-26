# Bind

**The allowance wallet for AI agents.** An agent can only spend what it said it would spend it on.

Built for ETHGlobal Tokyo 2026 · Sponsors applied: **Sui**, **World**, **Intercepta**.
Full design rationale, threat model, and division-of-labour argument: [BIND_PRD.md](./BIND_PRD.md).

## The wound

- **Grok/Bankr wallet — $330,000 (March 2025), then $175,000 again (May 2026).** An unsolicited
  "membership" object silently unlocked a higher permission tier; an encoded instruction in an X
  reply then redirected a payment. A guardrail against this exact path had been built after the
  first attack — it did not survive a later rewrite, because it lived in application code, not in
  what could actually move the money.
- **Bybit — $1.5B (February 2025).** Three security-trained employees approved a display reading
  "routine transfer." The signature actually authorized a malicious contract upgrade.

Bind's claim: an agent can be fully fooled and still be structurally incapable of moving money
anywhere it didn't declare, to anyone you didn't pre-approve, without your face.

## The mechanism

1. **Declare** — the agent states, as a typed object, exactly what it's about to pay: recipient,
   asset, max amount, an expiry, a reason.
2. **Diff** — before anything is signed, the actual transaction is dry-run and its *real* effects
   are diffed against the declaration. Anything extra — an undeclared beneficiary, a capability
   grant, an asset the declaration never named — is a violation.
3. **Screen** — Intercepta screens the recipient before any signature is even considered, on every
   path.
4. **Gate** — clean diff + allow-listed recipient → executes immediately. Clean diff + novel
   recipient → a fresh, per-declaration World ID verification is the only remaining door.
5. **Consume** — on Sui, funds only ever move by a Move call that takes a `Declaration` and a proof
   object as arguments and **destroys both on the way in**. There is no boolean flag to forget to
   check, and no path a future refactor can silently drop.

```
bind/sources/allowance_vault.move  — grep -n "balance::split"  →  exactly two call sites
```

## Try it

```bash
npm install
npm run dev
```

Open `/` for the pitch, `/app` for the console. Pick a scenario — villains first:

| Scenario | What it recreates | Caught by |
|---|---|---|
| Hidden effects | Bybit-class: display says routine, chain would do more | The dry-run diff |
| Flagged recipient | Agent is honest, recipient is a known bad actor | Intercepta, pre-signature |
| Escalation attempt | Grok/Bankr-class: unsolicited object + encoded instruction | Vault config is owner-only, period |
| Human denies | Novel recipient, owner declines the override | Absence of an object *is* the denial |
| Happy path | Clean diff, allow-listed recipient | Auto-executed, no friction |

No API keys are required to run any of this — see the disclosure register below for exactly
what's live vs. simulated at each layer, and `.env.example` for what flips each one on.

## Architecture

```
agent (Groq free tier, or claude-sonnet-5, or a scripted stand-in)
  → declares intent, never signs, never does arithmetic
lib/pipeline.ts
  → real simulateTransaction diff (falls back to a labelled simulation
    without funded gas) → lib/intercepta.ts screen → lib/mint.ts (real Move
    calls once bind/ is published, else a labelled simulated proof)
bind/ (Sui Move, real, 11/11 tests passing, LIVE on testnet)
  → allowance_vault + declaration + proofs modules; two functions can move
    money, both consume a proof object on the way in
```

**Live on Sui testnet:**
package [`0xe1bc90ba60e4fa5b62ce08ef36459114e1c99dd140b17178084a9cc75fad0b3f`](https://suiscan.xyz/testnet/object/0xe1bc90ba60e4fa5b62ce08ef36459114e1c99dd140b17178084a9cc75fad0b3f) ·
vault [`0xa8db67c36949c164cc18becd7e1de9dce704dd3757dda2308e8316755662c22c`](https://suiscan.xyz/testnet/object/0xa8db67c36949c164cc18becd7e1de9dce704dd3757dda2308e8316755662c22c). Both the auto-execute path (`execute_declared`) and the human-override path (`execute_with_override`) have real, verified on-chain transactions — vault balance and `window_spent` move exactly as declared, checked directly against the object after each call.

## Honest disclosure register

| Item | Status |
|---|---|
| Move contracts | **Real, and live.** Compiles clean, 11/11 unit tests pass, including an off-chain-signature-verifies-on-chain test and a wrong-declaration-id-fails test proving the signed message is actually bound to the declaration id (closing the gap the "Whisper Attacks" paper names for AP2). Published to testnet; both execution paths verified against real state. |
| Dry-run diff | Real `simulateTransaction` calls (gRPC — the public testnet fullnode has fully retired JSON-RPC) against Sui testnet when the demo sender has gas; a disclosed, labelled synthetic fallback otherwise. The UI badge says which one produced any given result. |
| Intercepta | Real API call when `INTERCEPTA_API_KEY` is set; otherwise a small, disclosed fixture list (`fixtures/flagged-address.ts`). |
| World | Sandbox mode (fake identities, as the track's own rules permit) unless `WORLD_APP_ID` / `WORLD_CLIENT_ID` are set. The override callback is validated **server-side only** either way. |
| Agent | Groq's free tier (`openai/gpt-oss-120b`) if `GROQ_API_KEY` is set, `claude-sonnet-5` if `ANTHROPIC_API_KEY` is set, else a deterministic scripted stand-in calling the identical tools in the identical order. |
| x402 feed | A real 402 → retry-with-payment round trip, facilitated in-process rather than by a third-party facilitator. |
| Honest boundary | Bind does not judge intent. An agent that honestly declares a bad payment to an address you'd already allow-listed will execute. Nothing can stop that short of judging intent — what Bind guarantees is that every outflow is either exactly what was declared to a pre-approved address, or it stopped and asked a verified human. |

## Repo layout

```
bind/                 Sui Move package (allowance_vault, declaration, proofs) + tests
agent/                ToolLoopAgent, fixed tool order, scripted fallback
lib/                  diff engine, chain adapter, Intercepta/World clients, on-chain mint calls
fixtures/             disclosed demo addresses, flagged-address list, the injected-feed attack
components/, app/     Next.js 16 App Router UI
scripts/deploy.sh     publish + wire + share, once gas exists
BIND_PRD.md           full design rationale and build log
```
