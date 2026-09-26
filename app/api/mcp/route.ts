import { NextRequest, NextResponse } from "next/server";
import { findAgent, findSubAccount, recordOutcome, refreshAgentBalances, type ActivityItem, walletState } from "@/lib/wallet-store";
import { guardrailsFor } from "@/lib/guardrails";
import { runScenario } from "@/lib/pipeline";
import { resolveConnection, recordConnectionUse } from "@/lib/connections";
import { findTask, TASKS } from "@/lib/tasks";
import { toJsonSafe } from "@/lib/json";

/**
 * Swish as an MCP server.
 *
 * This is the integration surface: any agent framework that speaks MCP —
 * Claude, Cursor, a custom loop — can use this wallet without anyone
 * writing a per-framework adapter. Wallet Standard gets you *sites*;
 * this gets you *agents*.
 *
 * Authorisation is the same connection token a site is granted, so an
 * agent reaching Swish over MCP is bound by exactly the limits its
 * operator approved: which agent, which envelope, per-payment cap,
 * expiry, action budget. There is no tool here that bypasses the diff,
 * the screen, the allow-list or the guardrails — `propose_payment` runs
 * the same pipeline the wallet's own UI does, and can come back blocked.
 *
 * Speaks JSON-RPC 2.0 over HTTP POST (MCP's streamable-HTTP transport).
 */

const PROTOCOL_VERSION = "2025-06-18";

const TOOLS = [
  {
    name: "list_agents",
    description:
      "List the agents this connection may use, with their envelopes, balances and spending limits.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_guardrails",
    description:
      "Read the limits that apply to an envelope: per-payment cap, rolling window, daily and per-counterparty ceilings, risk threshold, and which are enforced on-chain.",
    inputSchema: {
      type: "object",
      properties: { agentId: { type: "string" }, subAccountId: { type: "string" } },
      required: ["agentId", "subAccountId"],
      additionalProperties: false,
    },
  },
  {
    name: "list_tasks",
    description: "List the jobs an agent can be asked to carry out.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "propose_payment",
    description:
      "Ask an agent to carry out a task, which may involve paying a counterparty. The payment is diffed against the agent's declared intent, the counterparty is screened, and the envelope's guardrails are applied before anything is signed. Returns what happened: paid, blocked, or waiting on a human.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string" },
        subAccountId: { type: "string" },
        taskId: { type: "string", description: "One of the ids from list_tasks." },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
  },
  {
    name: "list_activity",
    description: "Recent payments and refusals, with the reason for each.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number" } },
      additionalProperties: false,
    },
  },
];

function rpcError(id: unknown, code: number, message: string, data?: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message, data } });
}

function rpcResult(id: unknown, result: unknown) {
  return NextResponse.json(toJsonSafe({ jsonrpc: "2.0", id, result }));
}

/** MCP tool results are content blocks; agents read the text. */
function textResult(id: unknown, payload: unknown, isError = false) {
  return rpcResult(id, {
    content: [{ type: "text", text: JSON.stringify(toJsonSafe(payload), null, 2) }],
    isError,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || body.jsonrpc !== "2.0") {
    return rpcError(null, -32600, "Expected a JSON-RPC 2.0 request.");
  }

  const { id, method, params } = body as { id?: unknown; method?: string; params?: Record<string, unknown> };

  // Handshake and discovery need no connection — you can look at what
  // Swish offers before you've been granted anything.
  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "swish-wallet", version: "1.0.0" },
      instructions:
        "Swish is an agent wallet. Payments you request here are checked against what the agent declared, screened for known-malicious counterparties, and bounded by the envelope's guardrails — so a request can legitimately come back blocked. That's the wallet working, not an error to retry around.",
    });
  }

  if (method === "notifications/initialized") {
    return new NextResponse(null, { status: 204 });
  }

  if (method === "tools/list") {
    return rpcResult(id, { tools: TOOLS });
  }

  if (method !== "tools/call") {
    return rpcError(id, -32601, `Unknown method: ${method}`);
  }

  // Everything below touches the wallet, so it needs a connection.
  const token =
    req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? new URL(req.url).searchParams.get("token");
  const resolved = resolveConnection(token ?? null, req.headers.get("origin"));

  if (!resolved.ok) {
    return rpcError(id, -32001, `Not connected: ${resolved.reason}`, {
      reason: resolved.reason,
      howToFix:
        resolved.reason === "unknown_token"
          ? "POST /api/connect to request a connection, then have the operator approve it."
          : "Ask the operator for a fresh connection.",
    });
  }

  const connection = resolved.connection;
  const name = (params?.name as string) ?? "";
  const args = (params?.arguments as Record<string, unknown>) ?? {};
  const state = walletState();

  try {
    switch (name) {
      case "list_agents": {
        // Balances go to an agent that may act on them, so they're read
        // from chain first rather than served from whatever the wallet
        // last remembered.
        await refreshAgentBalances();

        // Scoped to what this connection was granted, not the whole wallet.
        const agent = findAgent(connection.agentId);
        if (!agent) return textResult(id, { error: "the granted agent no longer exists" }, true);
        return textResult(id, {
          agents: [
            {
              id: agent.id,
              name: agent.name,
              role: agent.role,
              address: agent.address,
              status: agent.status,
              envelopes: agent.subAccounts
                .filter((s) => s.id === connection.subAccountId)
                .map((s) => ({
                  id: s.id,
                  label: s.label,
                  balanceSui: Number(s.balanceMist) / 1e9,
                  perPaymentCapSui: Number(s.perTxCapMist) / 1e9,
                  allowlistedCounterparties: s.allowlist.length,
                })),
            },
          ],
          connection: {
            actionsRemaining: connection.maxActions - connection.actionsUsed,
            expiresAt: connection.expiresAt,
          },
        });
      }

      case "get_guardrails": {
        const sub = findSubAccount(
          (args.agentId as string) ?? connection.agentId,
          (args.subAccountId as string) ?? connection.subAccountId
        );
        if (!sub) return textResult(id, { error: "no such envelope" }, true);
        const g = guardrailsFor(sub);
        return textResult(id, {
          perPaymentCapSui: Number(g.perTxCapMist) / 1e9,
          windowSeconds: g.windowMs / 1000,
          windowCapSui: Number(g.windowCapMist) / 1e9,
          dailyCapSui: g.dailyCapMist ? Number(g.dailyCapMist) / 1e9 : null,
          perCounterpartyCapSui: g.perCounterpartyCapMist ? Number(g.perCounterpartyCapMist) / 1e9 : null,
          refuseRiskScoreAtOrAbove: g.maxRiskScore,
          alwaysAskAboveSui: g.approvalThresholdMist ? Number(g.approvalThresholdMist) / 1e9 : null,
          enforcedOnChain: ["perPaymentCapSui", "windowCapSui"],
          // Stated explicitly because the absence of a list reads as
          // "unrestricted" to anything that isn't told otherwise — a model
          // reading this concluded exactly that, which is the opposite of
          // what an empty allow-list means.
          allowlist: {
            addresses: sub.allowlist.map((a) => a.address),
            rule: "An address must be on this list to be paid without a human approving it.",
            emptyMeans:
              sub.allowlist.length === 0
                ? "This list is empty, so NO counterparty can be paid automatically. Every payment stops for a verified human."
                : undefined,
          },
          customLimits: (g.custom ?? []).map((c) => ({
            title: c.title,
            description: c.description,
            measures: c.metric,
            limit: c.limit,
          })),
          note: "The on-chain limits hold even if this server is compromised. The rest are applied here before signing.",
        });
      }

      case "list_tasks":
        return textResult(id, {
          tasks: TASKS.map((t) => ({ id: t.id, label: t.label, detail: t.detail })),
        });

      case "list_activity": {
        const limit = Math.min(50, Math.max(1, Number(args.limit ?? 10)));
        return textResult(id, {
          activity: state.activity
            .filter((a) => a.agentId === connection.agentId)
            .slice(0, limit)
            .map((a) => ({
              task: a.task,
              amountSui: Number(a.amountMist) / 1e9,
              recipient: a.recipient,
              outcome: a.outcome,
              why:
                a.guardrailBreaches?.map((b) => b.plain).join(" ") ??
                a.diff.violations.map((v) => v.plain).join(" ") ??
                a.intercepta.reason,
              at: a.ts,
            })),
        });
      }

      case "propose_payment": {
        const agent = findAgent(connection.agentId);
        const sub = findSubAccount(connection.agentId, connection.subAccountId);
        const task = findTask(args.taskId as string);

        if (!agent || !sub) return textResult(id, { error: "the granted agent or envelope is gone" }, true);
        if (!task) {
          return textResult(id, { error: `unknown task: ${args.taskId}. Call list_tasks first.` }, true);
        }
        if (agent.status === "frozen") {
          return textResult(id, { outcome: "blocked", why: `${agent.name} is frozen by its operator.` }, true);
        }

        // The connection's limits, which are already no looser than the
        // envelope's, are what this request is held to.
        const guardrails = { ...guardrailsFor(sub), ...connection.guardrails };

        const result = await runScenario(task.scenario, {
          allowlist: sub.allowlist.map((a) => a.address),
          perTxCapMist: BigInt(guardrails.perTxCapMist),
          guardrails,
          history: state.activity.filter((a) => a.subAccountId === sub.id),
        });

        const banned = state.bannedAddresses.some(
          (b) => b.address.toLowerCase() === result.declaration.recipient.toLowerCase()
        );
        const outcome: ActivityItem["outcome"] = banned ? "hard_blocked" : result.outcome;

        const item: ActivityItem = {
          id: result.declaration.id,
          agentId: agent.id,
          subAccountId: sub.id,
          ts: Date.now(),
          task: `${task.label} (via ${connection.origin})`,
          scenario: task.scenario,
          recipient: result.declaration.recipient,
          amountMist: result.declaration.maxAmount.toString(),
          reason: result.declaration.reason,
          outcome,
          diff: result.diff,
          dryRun: result.dryRun,
          intercepta: result.intercepta ?? {
            address: result.declaration.recipient,
            flagged: false,
            riskScore: 0,
            source: "unsupported",
          },
          dryRunSource: result.dryRunSource,
          agentMode: result.agent.mode,
          narration: result.agent.narration,
          steps: result.agent.steps,
          txDigest: result.txDigest,
          proofObjectId: result.proofObjectId,
          reviewed: false,
          guardrailBreaches: result.guardrailBreaches,
        };

        state.activity.unshift(item);
        recordOutcome(agent, outcome);
        recordConnectionUse(connection);

        if (outcome === "auto_executed") {
          const spent = BigInt(item.amountMist);
          sub.balanceMist = (BigInt(sub.balanceMist) - spent).toString();
          sub.windowSpentMist = (BigInt(sub.windowSpentMist) + spent).toString();
        }

        const why =
          item.guardrailBreaches?.map((b) => b.plain).join(" ") ||
          item.diff.violations.map((v) => v.plain).join(" ") ||
          (item.intercepta.flagged ? item.intercepta.reason : undefined);

        return textResult(id, {
          outcome,
          amountSui: Number(item.amountMist) / 1e9,
          recipient: item.recipient,
          txDigest: item.txDigest ?? null,
          why: why ?? null,
          waitingOnHuman: outcome === "awaiting_human",
          actionsRemaining: connection.maxActions - connection.actionsUsed,
        });
      }

      default:
        return rpcError(id, -32602, `Unknown tool: ${name}`);
    }
  } catch (err) {
    console.error("[swish/mcp] tool failed", name, err);
    return textResult(id, { error: String(err instanceof Error ? err.message : err) }, true);
  }
}

/** Lets a client confirm the endpoint is alive without a connection. */
export async function GET() {
  return NextResponse.json({
    name: "swish-wallet",
    protocolVersion: PROTOCOL_VERSION,
    transport: "streamable-http (JSON-RPC 2.0 over POST)",
    tools: TOOLS.map((t) => t.name),
    auth: "Bearer <connection token> — POST /api/connect to request one.",
  });
}
