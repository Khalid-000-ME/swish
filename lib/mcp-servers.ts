/**
 * MCP servers your agents connect *out* to.
 *
 * This is the other direction from `app/api/mcp/route.ts`, which is the
 * server Swish exposes so somebody else's agent can ask this wallet for
 * money. Here your own agents are the clients: you register a server, Swish
 * asks it what tools it has, and you decide which of them each agent is
 * allowed to call.
 *
 * The allow-list is per agent and per tool, and it is enforced where the
 * agent loop is built rather than only shown in the UI — an agent is handed
 * the tools it was granted and no others, so a tool it wasn't granted isn't
 * something it can decide to call.
 *
 * None of this touches money. A tool from an outside server can fetch,
 * search, or compute; it cannot move funds, because moving funds still goes
 * through a declaration, a diff and the vault. Granting a tool widens what
 * an agent can *find out*, never what it can spend.
 */

export interface McpTool {
  name: string;
  description?: string;
}

export interface McpServer {
  id: string;
  /** What the operator calls it. */
  label: string;
  url: string;
  /** Sent as `Authorization`. Never returned to the browser. */
  authHeader?: string;
  tools: McpTool[];
  addedAt: number;
  lastProbedAt?: number;
  /** Why the last probe failed, if it did. */
  error?: string;
}

/** A grant is one tool on one server, written the way the UI keys them. */
export function toolKey(serverId: string, toolName: string): string {
  return `${serverId}::${toolName}`;
}

export function parseToolKey(key: string): { serverId: string; toolName: string } | null {
  const i = key.indexOf("::");
  if (i < 0) return null;
  return { serverId: key.slice(0, i), toolName: key.slice(i + 2) };
}

interface RpcResult {
  result?: { tools?: Array<{ name?: string; description?: string }> };
  error?: { message?: string };
}

async function rpc(server: Pick<McpServer, "url" | "authHeader">, method: string, params: unknown) {
  const res = await fetch(server.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(server.authHeader ? { authorization: server.authHeader } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    signal: AbortSignal.timeout(15_000),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 160)}`);

  // Streamable-HTTP servers answer a plain POST with an SSE frame rather
  // than bare JSON, so the payload arrives behind a `data:` prefix.
  const body = text.trimStart().startsWith("data:")
    ? text.slice(text.indexOf("data:") + 5).trim().split("\n")[0]
    : text;

  let parsed: RpcResult;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`answered with something that isn't JSON-RPC: ${text.slice(0, 120)}`);
  }
  if (parsed.error) throw new Error(parsed.error.message ?? "the server refused the call");
  return parsed;
}

/**
 * Asks a server what it can do.
 *
 * Initialises first, because a spec-compliant server is entitled to refuse
 * everything else until it has. Servers that don't care will answer the
 * tools/list either way, so this costs one extra round trip and buys
 * compatibility with the ones that do.
 */
export async function probeTools(server: Pick<McpServer, "url" | "authHeader">): Promise<McpTool[]> {
  try {
    await rpc(server, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "swish-wallet", version: "1.0.0" },
    });
  } catch {
    // Not fatal on its own — the tools/list below is the real test.
  }

  const listed = await rpc(server, "tools/list", {});
  const tools = listed.result?.tools ?? [];
  if (!Array.isArray(tools)) throw new Error("tools/list answered without a tools array");

  return tools
    .filter((t) => typeof t?.name === "string")
    .map((t) => ({ name: t.name as string, description: t.description }));
}

/** One tools/call against a registered server. */
export async function callTool(
  server: Pick<McpServer, "url" | "authHeader">,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const out = await rpc(server, "tools/call", { name, arguments: args });
  const content = (out.result as { content?: Array<{ text?: string }> } | undefined)?.content;
  const text = content?.[0]?.text;
  if (typeof text !== "string") return out.result;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** The browser is never shown an auth header it might log or persist. */
export function stripServerSecrets(server: McpServer): Omit<McpServer, "authHeader"> & {
  hasAuth: boolean;
} {
  const { authHeader, ...rest } = server;
  return { ...rest, hasAuth: Boolean(authHeader) };
}
