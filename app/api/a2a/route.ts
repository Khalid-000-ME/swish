import { NextRequest, NextResponse } from "next/server";
import { ToolLoopAgent, tool, isStepCount } from "ai";
import { z } from "zod";
import { candidateModels } from "@/agent";
import { approveRequest, createRequest } from "@/lib/connections";
import { findAgent, findSubAccount, walletState } from "@/lib/wallet-store";
import { guardrailsFor } from "@/lib/guardrails";
import { toJsonSafe } from "@/lib/json";

/**
 * Agent-to-agent: a prompt in, an agent working through this wallet's own
 * MCP server out.
 *
 * The obvious shortcut here is to call the wallet's internal functions
 * directly and present the result as if an agent had done it over MCP.
 * That would demo identically and prove nothing. Instead this spawns a
 * real tool-calling agent whose tools are HTTP calls to /api/mcp, holding
 * a real connection token, subject to the same authentication and the same
 * guardrails as any third-party client. If the integration is broken, this
 * console breaks with it — which is the point of having it.
 *
 * The connection it mints is deliberately small: a handful of actions and
 * a few minutes, scoped to one envelope, revocable from the Sites screen
 * like any other.
 */

const MAX_STEPS = 8;

interface Step {
  tool: string;
  input: unknown;
  output: unknown;
  ok: boolean;
}

const SYSTEM = `You are an operator's assistant working through the Bind wallet's MCP server.

You do not hold a key and you cannot move money. Every payment you propose
is simulated, diffed against what the agent declared, screened, and checked
against the envelope's limits before anything is signed. A refusal is a
normal outcome, not an error — report it plainly, with the reason.

Work in this order: find out what exists before you act on it. Call
list_agents and get_guardrails before proposing anything, and list_tasks
before naming a task id. Never invent an id.

When you're done, say in two or three sentences what you did and what
happened. If something was refused, say what would have to change.`;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { prompt, agentId, subAccountId } = body as {
    prompt?: string;
    agentId?: string;
    subAccountId?: string;
  };

  if (!prompt?.trim()) return NextResponse.json({ error: "a prompt is required" }, { status: 400 });

  const state = walletState();
  const agent = agentId ? findAgent(agentId) : state.agents[0];
  if (!agent) return NextResponse.json({ error: "no agents to work with yet" }, { status: 404 });

  const sub = subAccountId ? findSubAccount(agent.id, subAccountId) : agent.subAccounts[0];
  if (!sub) return NextResponse.json({ error: "no such envelope" }, { status: 404 });

  const candidates = candidateModels();
  if (candidates.length === 0) {
    return NextResponse.json(
      { error: "No model is configured. Set GROQ_API_KEY (free tier) or ANTHROPIC_API_KEY." },
      { status: 409 }
    );
  }

  // A real grant, from the same code path the extension's approval screen
  // uses — not a bypass.
  const origin = new URL(req.url).origin;
  const request = createRequest(origin, "The A2A console, run by you");
  const connection = approveRequest({
    requestId: request.id,
    agentId: agent.id,
    subAccountId: sub.id,
    guardrails: guardrailsFor(sub),
    ttlMs: 5 * 60_000,
    maxActions: MAX_STEPS,
  });
  if (!connection) return NextResponse.json({ error: "could not open a connection" }, { status: 500 });

  const steps: Step[] = [];

  /** One MCP tools/call over HTTP, exactly as an outside client would. */
  async function mcp(name: string, args: Record<string, unknown>) {
    const res = await fetch(`${origin}/api/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${connection!.token}`,
        origin,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: steps.length + 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });

    const payload = await res.json().catch(() => null);
    if (payload?.error) {
      const out = { error: payload.error.message ?? "MCP refused the call" };
      steps.push({ tool: name, input: args, output: out, ok: false });
      return out;
    }

    const text = payload?.result?.content?.[0]?.text;
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* some tools answer in prose; keep it as-is */
    }
    steps.push({ tool: name, input: args, output: parsed, ok: !payload?.result?.isError });
    return parsed;
  }

  const tools = {
    list_agents: tool({
      description: "List the agents this connection may use, with envelopes, balances and limits.",
      inputSchema: z.object({}),
      execute: async () => mcp("list_agents", {}),
    }),
    get_guardrails: tool({
      description: "Read the limits that apply to an envelope, and which are enforced on-chain.",
      inputSchema: z.object({ agentId: z.string(), subAccountId: z.string() }),
      execute: async (input) => mcp("get_guardrails", input),
    }),
    list_tasks: tool({
      description: "List the jobs an agent can be asked to carry out.",
      inputSchema: z.object({}),
      execute: async () => mcp("list_tasks", {}),
    }),
    propose_payment: tool({
      description:
        "Ask an agent to carry out a task. The payment is diffed against the declared intent, the counterparty screened, and the guardrails applied before anything is signed.",
      inputSchema: z.object({
        taskId: z.string(),
        agentId: z.string().optional(),
        subAccountId: z.string().optional(),
      }),
      execute: async (input) => mcp("propose_payment", input),
    }),
    list_activity: tool({
      description: "Recent payments and refusals, with the reason for each.",
      inputSchema: z.object({ limit: z.number().optional() }),
      execute: async (input) => mcp("list_activity", input),
    }),
  };

  for (let i = 0; i < candidates.length; i++) {
    const { label, model } = candidates[i];
    try {
      const loop = new ToolLoopAgent({
        model,
        instructions: SYSTEM,
        tools,
        stopWhen: isStepCount(MAX_STEPS),
      });

      const result = await loop.generate({
        prompt: `You are working with agent "${agent.name}" (id ${agent.id}) and its envelope "${sub.label}" (id ${sub.id}).\n\n${prompt.trim()}`,
      });

      return NextResponse.json(
        toJsonSafe({
          model: label,
          narration: result.text,
          steps,
          connectionId: connection.id,
        })
      );
    } catch (err) {
      // A rate limit on the free tier shouldn't end the run — the next
      // configured provider gets a turn before this gives up.
      console.warn(`[bind/a2a] ${label} failed:`, err instanceof Error ? err.message : err);
      if (i === candidates.length - 1) {
        return NextResponse.json(
          toJsonSafe({
            error: `Every configured model failed. Last error: ${err instanceof Error ? err.message : err}`,
            steps,
          }),
          { status: 502 }
        );
      }
    }
  }

  return NextResponse.json({ error: "no model produced a result", steps }, { status: 502 });
}

/** What an outside MCP client needs to connect. */
export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  return NextResponse.json(
    toJsonSafe({
      endpoint: `${origin}/api/mcp`,
      protocolVersion: "2025-06-18",
      transport: "JSON-RPC 2.0 over HTTP POST",
      auth: "Bearer <token>, from a connection you approve on the Sites screen",
      modelConfigured: candidateModels().map((m) => m.label),
    })
  );
}
