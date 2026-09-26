import { NextRequest, NextResponse } from "next/server";
import { fromBase64, toBase64 } from "@mysten/sui/utils";
import { Transaction } from "@mysten/sui/transactions";
import { fundedGasCoin, suiClient } from "@/lib/sui";
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

const GAS_BUDGET_MIST = 10_000_000n;

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
    const gas = await fundedGasCoin(agent.address);
    if (!gas) {
      return NextResponse.json(
        {
          error: `${agent.name}'s address holds no SUI, so it can't pay gas. Send it some testnet SUI at ${agent.address}.`,
        },
        { status: 409 }
      );
    }
    tx.setGasPayment([gas]);
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
      return NextResponse.json(
        toJsonSafe({ outcome: "blocked", why: "The transaction fails in simulation.", status: t.status }),
        { status: 422 }
      );
    }

    const guardrails = { ...guardrailsFor(sub), ...connection.guardrails };
    const breaches: string[] = [];

    // Everything leaving this agent, and everyone receiving.
    const outflow = (t.balanceChanges ?? [])
      .filter((b) => b.address === agent.address && BigInt(b.amount) < 0n)
      .reduce((n, b) => n + -BigInt(b.amount), 0n);

    const recipients = [
      ...new Set(
        (t.balanceChanges ?? [])
          .filter((b) => b.address !== agent.address && BigInt(b.amount) > 0n)
          .map((b) => b.address)
      ),
    ];

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
          ? `${connection.origin} asked ${agent.name} to sign a transaction, and Swish refused.`
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
