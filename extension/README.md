# Swish — browser extension

Registers Swish on every page as a Sui wallet, so any dApp can connect to
it the way it would to any other wallet. What it hands back is an
**agent's** address, not yours.

## Load it

1. Run the wallet: `npm run dev` in the repo root (default `http://localhost:3000`).
2. Chrome → `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick this `extension/` folder.
3. Open the popup and set the wallet address if it isn't the default.

## What happens when a site connects

`connect` opens Swish's approval screen in a tab. You choose the agent,
the envelope, a per-payment cap, an expiry and an action budget. Only
then is a token minted, and it's stored per origin.

## What happens when a site asks for a signature

The transaction bytes go to the wallet server, which **simulates them
first** and compares what they would actually do against what the
connection allows — total outflow against the cap, recipients against
the allow-list and ban list, a counterparty screen, and a check for any
capability object changing hands. Only then does the agent's key sign.

A refusal comes back to the dApp as a thrown error naming each reason.
That's the wallet working. Verified against a real transaction: a
0.032 SUI transfer to an unlisted address under a 0.01 cap came back
blocked with both reasons and nothing signed.

`signTransaction` is deliberately unimplemented — handing back a
signature Swish doesn't execute would let a site hold it and broadcast
later, after the checks stopped being true.

## What it does not hold

Agent keys. They stay sealed on the server; this extension routes
requests and carries answers. A browser extension is a poor place to
keep something that can move money.
