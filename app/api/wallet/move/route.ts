import { NextRequest, NextResponse } from "next/server";
import { findAgent, findSubAccount, refreshAgentBalances, walletState } from "@/lib/wallet-store";
import { agentKeypair } from "@/lib/agent-keys";
import {
  depositFromAgent,
  depositFromOwner,
  executorAddress,
  executorBalanceMist,
  GAS_BUDGET_MIST,
  isMintConfigured,
  sendFromAgent,
  withdrawFromVault,
} from "@/lib/mint";
import { suiToMist } from "@/lib/amount";
import { toJsonSafe } from "@/lib/json";

/**
 * Moving money between the three places it can sit.
 *
 * Until now it only flowed one way: the vault could fund an agent and
 * nothing could bring it back, so anything sent to an agent for gas was
 * stranded there and an allocation could only ever grow. One endpoint
 * covers every direction instead, because the directions differ in who
 * signs, not in what the operator is trying to do.
 *
 *   vault_to_agent     owner_withdraw, signed by the vault owner
 *   vault_to_operator  the same call, paid back to the owner's own key
 *   operator_to_vault  the owner signs a deposit, topping the pool up
 *   agent_to_vault     the agent signs a deposit; deposit is public
 *   agent_to_operator  the agent signs an ordinary transfer
 *   reallocate         no chain call at all — see below
 *
 * `reallocate` is bookkeeping. An envelope's balance is a claim on the
 * pool rather than a separate pot of money, so raising or lowering one
 * moves no SUI and needs no signature. Treating it as a transfer would
 * have invented a transaction that doesn't exist.
 */
type Direction =
  | "vault_to_agent"
  | "vault_to_operator"
  | "operator_to_vault"
  | "agent_to_vault"
  | "agent_to_operator"
  | "reallocate";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { direction, agentId, subAccountId, amountSui, all } = body as {
    direction?: Direction;
    agentId?: string;
    subAccountId?: string;
    amountSui?: number;
    /** Sweep everything, less this transaction's own gas. */
    all?: boolean;
  };

  const state = walletState();

  if (direction === "reallocate") {
    if (!agentId || !subAccountId || amountSui === undefined) {
      return NextResponse.json(
        { error: "agentId, subAccountId and amountSui are required" },
        { status: 400 }
      );
    }
    const sub = findSubAccount(agentId, subAccountId);
    if (!sub) return NextResponse.json({ error: "no such envelope" }, { status: 404 });
    if (!(amountSui >= 0)) {
      return NextResponse.json({ error: "an allocation can't be negative" }, { status: 400 });
    }

    const before = sub.balanceMist;
    sub.balanceMist = suiToMist(amountSui).toString();
    return NextResponse.json(
      toJsonSafe({
        direction,
        fromMist: before,
        toMist: sub.balanceMist,
        note: "An allocation is a claim on the vault, so nothing moved on chain.",
      })
    );
  }

  if (!isMintConfigured() || !state.vault.objectId) {
    return NextResponse.json(
      { error: "No published vault is configured, so there's nothing on chain to move." },
      { status: 409 }
    );
  }

  // Listed rather than excluded one by one — the previous form said
  // "everything except vault_to_operator needs an agent", which quietly
  // became wrong the moment a second agentless direction was added.
  const NEEDS_AGENT: Direction[] = ["vault_to_agent", "agent_to_vault", "agent_to_operator"];
  const agent = agentId ? findAgent(agentId) : undefined;
  if (direction && NEEDS_AGENT.includes(direction) && !agent) {
    return NextResponse.json({ error: "no such agent" }, { status: 404 });
  }

  // Money coming back goes to the address that owns the vault and pays
  // for owner operations, not to the sign-in identity. Those are two
  // different keypairs, and paying the identity would strand the funds
  // somewhere the wallet never spends from.
  const owner = executorAddress();
  if (
    (direction === "vault_to_operator" ||
      direction === "agent_to_operator" ||
      direction === "operator_to_vault") &&
    !owner
  ) {
    return NextResponse.json(
      { error: "No vault owner key is configured, so there's nowhere for this to go." },
      { status: 409 }
    );
  }

  const want = amountSui !== undefined ? suiToMist(amountSui) : null;
  if (want !== null && want <= 0n) {
    return NextResponse.json({ error: "the amount has to be above zero" }, { status: 400 });
  }

  try {
    switch (direction) {
      case "vault_to_agent":
      case "vault_to_operator": {
        if (want === null) {
          return NextResponse.json({ error: "amountSui is required" }, { status: 400 });
        }
        // Paying an agent spends that agent's allocation; paying yourself
        // spends the pool directly and leaves allocations alone, which is
        // why only one of these touches an envelope.
        //
        // The allocation is checked first because it is the more specific
        // limit: when both would refuse, "this agent is only allocated X"
        // tells the operator what to change, and "the vault holds Y" does
        // not.
        let sub;
        if (direction === "vault_to_agent") {
          sub = subAccountId ? findSubAccount(agent!.id, subAccountId) : agent!.subAccounts[0];
          if (!sub) return NextResponse.json({ error: "no such envelope" }, { status: 404 });
          if (want > BigInt(sub.balanceMist)) {
            return NextResponse.json(
              {
                error: `${sub.label} is allocated ${Number(sub.balanceMist) / 1e9} SUI — not enough for ${Number(want) / 1e9}.`,
              },
              { status: 409 }
            );
          }
        }

        const pool = BigInt(state.vault.balanceMist);
        if (want > pool) {
          return NextResponse.json(
            { error: `The vault only holds ${Number(pool) / 1e9} SUI.` },
            { status: 409 }
          );
        }

        const recipient = direction === "vault_to_agent" ? agent!.address : owner!;
        const { digest } = await withdrawFromVault({
          vaultObjectId: state.vault.objectId,
          recipient,
          amountMist: want,
        });
        if (sub) sub.balanceMist = (BigInt(sub.balanceMist) - want).toString();

        await refreshAgentBalances();
        return NextResponse.json(toJsonSafe({ direction, digest, recipient }));
      }

      case "operator_to_vault": {
        if (want === null) {
          return NextResponse.json({ error: "amountSui is required" }, { status: 400 });
        }

        // Checked before the call, because the gas budget is reserved from
        // the same coins for the transaction's duration — so it is part of
        // what the key must hold, not just a cap on what it may spend.
        const owned = await executorBalanceMist();
        if (want + GAS_BUDGET_MIST > owned) {
          return NextResponse.json(
            {
              error: `Your key holds ${Number(owned) / 1e9} SUI. Depositing ${Number(want) / 1e9} needs that plus ${Number(GAS_BUDGET_MIST) / 1e9} reserved for gas.`,
            },
            { status: 409 }
          );
        }

        const { digest } = await depositFromOwner({
          vaultObjectId: state.vault.objectId,
          amountMist: want,
        });

        // Deposits land in the pool without being earmarked; the operator
        // decides which envelope gets to draw on them.
        await refreshAgentBalances();
        return NextResponse.json(toJsonSafe({ direction, digest }));
      }

      case "agent_to_vault":
      case "agent_to_operator": {
        const keypair = agentKeypair(agent!.sealedSecret);
        if (!keypair) {
          return NextResponse.json(
            {
              error: `${agent!.name} has no usable signing key, so nothing can be sent from its address.`,
            },
            { status: 409 }
          );
        }

        if (direction === "agent_to_operator") {
          const { digest, sentMist } = await sendFromAgent({
            agentKeypair: keypair,
            recipient: owner!,
            amountMist: all ? null : want,
          });
          await refreshAgentBalances();
          return NextResponse.json(toJsonSafe({ direction, digest, sentMist: sentMist.toString() }));
        }

        if (want === null) {
          return NextResponse.json({ error: "amountSui is required" }, { status: 400 });
        }
        const { digest } = await depositFromAgent({
          agentKeypair: keypair,
          vaultObjectId: state.vault.objectId,
          amountMist: want,
        });

        // Money returning to the pool is not automatically re-earmarked
        // for the agent that sent it; the operator decides where it goes.
        await refreshAgentBalances();
        return NextResponse.json(toJsonSafe({ direction, digest }));
      }

      default:
        return NextResponse.json({ error: `unknown direction: ${direction}` }, { status: 400 });
    }
  } catch (err) {
    console.error("[swish] /api/wallet/move failed", err);
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err) },
      { status: 502 }
    );
  }
}
