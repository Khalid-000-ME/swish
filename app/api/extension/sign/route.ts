import { NextRequest, NextResponse } from "next/server";
import { fromBase64, toBase64 } from "@mysten/sui/utils";
import { Transaction } from "@mysten/sui/transactions";
import { allGasCoins, suiClient } from "@/lib/sui";
import { agentKeypair } from "@/lib/agent-keys";
import { findAgent, findSubAccount, recordOutcome, walletState, type ActivityItem } from "@/lib/wallet-store";
import { guardrailsFor } from "@/lib/guardrails";
import { screenCounterparty } from "@/lib/intercepta";
import { resolveConnection, recordConnectionUse } from "@/lib/connections";
import { COUNTERPARTY_EVM } from "@/fixtures/addresses";
import { toJsonSafe } from "@/lib/json";

/**
 * Sign-and-execute for a transaction a *site* built.
 *
 * This is where the wallet's thesis meets a real dApp. An ordinary
 * wallet asks "do you approve this opaque blob?" and signs whatever
 * comes back. Swish simulates the transaction first and checks what it
 * would actually do against what this envelope is allowed to do — so a
 * site can't get a signature for something that moves more than the
 * cap, pays a counterparty nobody cleared, or quietly grants a
 * capability along the way.
 *
 * There's no agent-declared intent here the way there is for a task, so
 * the envelope's own rules stand in for the declaration: the guardrails
 * are what was promised, and the simulation is what would happen.
 */

const CAP_RE = /(::.*Cap\b|Capability|AdminCap|TreasuryCap|OwnerCap|UpgradeCap)/i;

/**
 * Reserved from the agent's coins while the transaction runs, which makes
 * it a floor on what the agent must hold rather than only a cap on what it
 * may spend. At 10 mSUI an agent with 0.027 could not pay 0.02 — the split
 * left 0.002 behind and the budget wanted 0.01. A split-and-transfer costs
 * well under 5.
 */
const GAS_BUDGET_MIST = 5_000_000n;

/**
 * A site hands over its transaction in whichever form its kit produced:
 * the Wallet Standard passes a JSON build plan, while anything talking
 * to this endpoint directly is likelier to have BCS bytes.
 */
function parseTransaction(input: string): Transaction {
  return Transaction.from(input.trimStart().startsWith("{") ? input : fromBase64(input));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { transaction, mode } = body as { transaction?: string; mode?: "sign" | "signAndExecute" };
  const signOnly = mode === "sign";

  const token =
    req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? (body as { token?: string }).token;
  const resolved = resolveConnection(token ?? null, req.headers.get("origin"));
  if (!resolved.ok) {
    return NextResponse.json({ error: `not connected: ${resolved.reason}`, reason: resolved.reason }, { status: 401 });
  }
  const connection = resolved.connection;

  if (!transaction) {
    return NextResponse.json({ error: "transaction bytes (base64) are required" }, { status: 400 });
  }

  const agent = findAgent(connection.agentId);
  const sub = findSubAccount(connection.agentId, connection.subAccountId);
  if (!agent || !sub) return NextResponse.json({ error: "granted agent or envelope is gone" }, { status: 404 });

  if (agent.status === "frozen") {
    return NextResponse.json(
      { error: `${agent.name} is frozen by its operator`, outcome: "blocked" },
      { status: 403 }
    );
  }

  const keypair = agentKeypair(agent.sealedSecret);
  if (!keypair) {
    return NextResponse.json(
      {
        error:
          "This agent has no usable signing key — SWISH_AGENT_KEY_SECRET is unset or changed, so its sealed secret can't be opened.",
      },
      { status: 409 }
    );
  }

  try {
    const client = suiClient();
    const tx = parseTransaction(transaction);

    // A site can name a sender, but Swish only holds one key per agent.
    // Quietly rewriting the sender would change what was asked for, so
    // a mismatch is refused instead.
    const declaredSender = tx.getData().sender;
    if (declaredSender && declaredSender !== agent.address) {
      return NextResponse.json(
        {
          outcome: "blocked",
          why: `This transaction is built to be sent by ${declaredSender}, which isn't ${agent.name}.`,
        },
        { status: 403 }
      );
    }
    tx.setSender(agent.address);

    // The site left gas unset — it has no way to know which coin this
    // agent pays from — so Swish resolves it before anything is checked.
    //
    // Every coin, not the first. An agent accumulates coins as it is
    // topped up, and paying from one of them means the amount being sent
    // has to fit inside that single coin: an agent holding 0.022 and
    // 0.005 could not send 0.02, because the split came out of the 0.022
    // and left too little behind for gas.
    const gas = await allGasCoins(agent.address);
    if (gas.length === 0) {
      return NextResponse.json(
        {
          error: `${agent.name}'s address holds no SUI, so it can't pay gas. Send it some testnet SUI at ${agent.address}.`,
        },
        { status: 409 }
      );
    }
    tx.setGasPayment(gas);
    tx.setGasBudget(GAS_BUDGET_MIST);
    const { referenceGasPrice } = await client.getReferenceGasPrice();
    tx.setGasPrice(BigInt(referenceGasPrice));

    // Signing without broadcasting hands back something that can be held
    // and replayed later, when the checks below may no longer hold. The
    // signature is bounded to the current epoch so that window closes on
    // its own rather than staying open forever.
    const { systemState } = await client.getCurrentSystemState();
    tx.setExpiration({ Epoch: Number(systemState.epoch) });

    // Build once. Everything from here — the simulation, the checks, the
    // signature — is about these exact bytes, so there's no gap between
    // what Swish approved and what it signed.
    const txBytes = await tx.build({ client });

    // What would this actually do?
    const sim = await client.simulateTransaction({
      transaction: txBytes,
      include: { balanceChanges: true, effects: true, objectTypes: true },
    });

    const t = sim.$kind === "Transaction" ? sim.Transaction : sim.FailedTransaction;
    if (sim.$kind === "FailedTransaction") {
      // Say what went wrong. "Fails in simulation" is true of every
      // failure and useful for none of them — it sent us looking at the
      // guardrails when the agent simply had less SUI than the payment
      // plus its gas.
      const detail = t.status?.error?.message ?? "";
      const why = /InsufficientCoinBalance|InsufficientGas|balance/i.test(detail)
        ? `${agent.name} holds less SUI than this payment plus its gas. Top up ${agent.address}.`
        : detail
          ? `This transaction fails on chain: ${detail}`
          : "This transaction fails in simulation.";

      return NextResponse.json(toJsonSafe({ outcome: "blocked", why, status: t.status }), {
        status: 422,
      });
    }

    const guardrails = { ...guardrailsFor(sub), ...connection.guardrails };
    const breaches: string[] = [];

    // What counterparties actually receive.
    //
    // This used to be the agent's own debit, which is the payment *plus
    // the network fee* — so a 0.02 cap refused a 0.02 purchase every time,
    // for being 0.02199788. Gas is paid to validators, not to anyone the
    // operator is trying to bound; a per-payment cap is about who gets the
    // money. Measuring the credits rather than the debit also means a
    // transaction that merely burns gas has an outflow of zero, which is
    // the truthful answer.
    const credits = (t.balanceChanges ?? []).filter(
      (b) => b.address !== agent.address && BigInt(b.amount) > 0n
    );
    const outflow = credits.reduce((n, b) => n + BigInt(b.amount), 0n);
    const recipients = [...new Set(credits.map((b) => b.address))];

    // Kept for the record, so the wallet's history can show what the
    // transaction cost on top of what it paid.
    const gasMist =
      (t.balanceChanges ?? [])
        .filter((b) => b.address === agent.address && BigInt(b.amount) < 0n)
        .reduce((n, b) => n + -BigInt(b.amount), 0n) - outflow;

    if (outflow > BigInt(guardrails.perTxCapMist)) {
      breaches.push(
        `Moves ${Number(outflow) / 1e9} SUI, over this connection's ${Number(guardrails.perTxCapMist) / 1e9} SUI per-payment limit.`
      );
    }

    // A capability changing hands is never part of a payment.
    const objectTypes = t.objectTypes ?? {};
    for (const changed of t.effects?.changedObjects ?? []) {
      const type = objectTypes[changed.objectId];
      if (type && CAP_RE.test(type)) {
        breaches.push(`Would hand over a capability object (${type.split("::").pop()}).`);
      }
    }

    // Counterparties nobody has cleared.
    const allowlisted = new Set(sub.allowlist.map((a) => a.address));
    const unlisted = recipients.filter((r) => !allowlisted.has(r));
    if (unlisted.length > 0) {
      breaches.push(
        `Pays ${unlisted.length} counterparty${unlisted.length === 1 ? "" : "s"} not on this envelope's allow-list.`
      );
    }

    const banned = walletState().bannedAddresses.filter((b) =>
      recipients.some((r) => r.toLowerCase() === b.address.toLowerCase())
    );
    if (banned.length > 0) breaches.push("Pays an address you banned.");

    // Screen the counterparty the same way a task would.
    const screen = await screenCounterparty(COUNTERPARTY_EVM.heliosData, recipients[0] ?? agent.address);
    if (screen.flagged) breaches.push(screen.reason ?? "The counterparty screened as high risk.");

    const state = walletState();
    const outcome: ActivityItem["outcome"] = breaches.length > 0 ? "blocked" : "auto_executed";

    let digest: string | undefined;
    let effects: string | undefined;
    let signature: string | undefined;

    if (breaches.length === 0 && signOnly) {
      signature = (await keypair.signTransaction(txBytes)).signature;
    } else if (breaches.length === 0) {
      const result = await client.executeTransaction({
        transaction: txBytes,
        signatures: [(await keypair.signTransaction(txBytes)).signature],
        include: { effects: true },
      });
      if (result.$kind === "FailedTransaction") {
        return NextResponse.json(
          toJsonSafe({ outcome: "blocked", why: "Execution failed on chain.", status: result.FailedTransaction.status }),
          { status: 422 }
        );
      }
      digest = result.Transaction.digest;
      effects = result.Transaction.effects?.bcs ? Buffer.from(result.Transaction.effects.bcs).toString("base64") : "";
      signature = result.Transaction.signatures?.[0];
    }

    // Everything a site asks for lands in the wallet's own history, so
    // an operator sees what was done in their name whether or not it
    // went through.
    state.activity.unshift({
      id: `ext-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      agentId: agent.id,
      subAccountId: sub.id,
      ts: Date.now(),
      task: `Transaction from ${connection.origin}`,
      scenario: "happy_path",
      recipient: recipients[0] ?? agent.address,
      amountMist: outflow.toString(),
      reason: `Requested by ${connection.origin}`,
      outcome,
      diff: {
        verdict: breaches.length > 0 ? "violations" : "clean",
        violations: breaches.map((plain) => ({ kind: "site_transaction", detail: plain, plain })),
        needsHuman: false,
        effectsDigest: t.digest ?? "",
      },
      dryRun: {
        status: "success",
        balanceChanges: (t.balanceChanges ?? []).map((b) => ({
          owner: b.address,
          coinType: b.coinType,
          amount: BigInt(b.amount),
        })),
        objectChanges: [],
        effectsDigest: t.digest ?? "",
      },
      intercepta: screen,
      dryRunSource: "chain",
      agentMode: "scripted",
      narration:
        breaches.length > 0
          ? `${connection.origin} asked ${agent.name} to sign a transaction, and Swish refused. It would have paid ${Number(outflow) / 1e9} SUI, plus ${Number(gasMist) / 1e9} in gas.`
          : signOnly
            ? `Swish signed this for ${connection.origin}, which broadcasts it itself — so there's no digest here. The signature is only good for the current epoch.`
            : `${connection.origin} asked ${agent.name} to sign a transaction, and Swish signed and submitted it.`,
      steps: [],
      txDigest: digest,
      reviewed: false,
    });

    recordOutcome(agent, outcome);
    recordConnectionUse(connection);

    if (breaches.length > 0) {
      return NextResponse.json(
        toJsonSafe({ outcome: "blocked", why: breaches, simulatedOutflowSui: Number(outflow) / 1e9 }),
        { status: 403 }
      );
    }

    // The bytes going back are Swish's, not the site's — gas and expiry
    // are filled in, so the site must broadcast these rather than what
    // it built.
    return NextResponse.json(
      toJsonSafe({
        outcome: signOnly ? "signed" : "executed",
        digest,
        effects,
        signature,
        bytes: toBase64(txBytes),
      })
    );
  } catch (err) {
    console.error("[swish/extension] sign failed", err);
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
