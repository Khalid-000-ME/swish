import { NextRequest, NextResponse } from "next/server";
import { findAgent, walletState } from "@/lib/wallet-store";
import { parseToolKey, probeTools, stripServerSecrets, toolKey } from "@/lib/mcp-servers";
import { toJsonSafe } from "@/lib/json";

/**
 * Registering MCP servers for agents to call out to, and deciding which of
 * their tools each agent may use.
 *
 * Adding a server probes it immediately rather than taking the operator's
 * word for the URL. A server that can't be reached, or that answers with
 * something other than a tool list, is refused at the point of adding —
 * not stored as a row that silently does nothing until an agent tries to
 * use it mid-run.
 */
export async function GET() {
  return NextResponse.json(
    toJsonSafe({ servers: walletState().mcpServers.map(stripServerSecrets) })
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { label, url, authHeader } = body as {
    label?: string;
    url?: string;
    authHeader?: string;
  };

  if (!url?.trim()) return NextResponse.json({ error: "a server URL is required" }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return NextResponse.json({ error: `${url} isn't a URL` }, { status: 400 });
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return NextResponse.json({ error: "only http and https are supported" }, { status: 400 });
  }

  const state = walletState();
  if (state.mcpServers.some((s) => s.url === parsed.toString())) {
    return NextResponse.json({ error: "that server is already registered" }, { status: 409 });
  }

  let tools;
  try {
    tools = await probeTools({ url: parsed.toString(), authHeader: authHeader?.trim() || undefined });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Couldn't read a tool list from that server: ${err instanceof Error ? err.message : err}`,
      },
      { status: 502 }
    );
  }

  const server = {
    id: `mcp-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    label: label?.trim() || parsed.host,
    url: parsed.toString(),
    authHeader: authHeader?.trim() || undefined,
    tools,
    addedAt: Date.now(),
    lastProbedAt: Date.now(),
  };
  state.mcpServers.push(server);

  return NextResponse.json(toJsonSafe({ server: stripServerSecrets(server) }));
}

/** Re-probe a server, or set which tools an agent may call. */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { serverId, agentId, tools, action } = body as {
    serverId?: string;
    agentId?: string;
    tools?: string[];
    action?: "refresh";
  };

  const state = walletState();

  if (action === "refresh") {
    const server = state.mcpServers.find((s) => s.id === serverId);
    if (!server) return NextResponse.json({ error: "no such server" }, { status: 404 });
    try {
      server.tools = await probeTools(server);
      server.lastProbedAt = Date.now();
      server.error = undefined;
    } catch (err) {
      server.error = err instanceof Error ? err.message : String(err);
      server.lastProbedAt = Date.now();
    }
    return NextResponse.json(toJsonSafe({ server: stripServerSecrets(server) }));
  }

  if (!agentId || !Array.isArray(tools)) {
    return NextResponse.json({ error: "agentId and tools are required" }, { status: 400 });
  }

  const agent = findAgent(agentId);
  if (!agent) return NextResponse.json({ error: "no such agent" }, { status: 404 });

  // Only grant what exists. A key for a server that's gone, or a tool the
  // server no longer lists, would sit in the grant looking like access to
  // something and resolve to nothing at run time.
  const known = new Set(
    state.mcpServers.flatMap((s) => s.tools.map((t) => toolKey(s.id, t.name)))
  );
  const unknown = tools.filter((t) => !known.has(t));
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `not offered by any registered server: ${unknown.join(", ")}` },
      { status: 400 }
    );
  }

  agent.mcpTools = tools;
  return NextResponse.json(toJsonSafe({ agentId, granted: tools.length }));
}

export async function DELETE(req: NextRequest) {
  const { serverId } = (await req.json().catch(() => ({}))) as { serverId?: string };
  const state = walletState();

  const before = state.mcpServers.length;
  state.mcpServers = state.mcpServers.filter((s) => s.id !== serverId);
  if (state.mcpServers.length === before) {
    return NextResponse.json({ error: "no such server" }, { status: 404 });
  }

  // Grants that pointed at it would otherwise linger as dead keys.
  let revoked = 0;
  for (const agent of state.agents) {
    const kept = (agent.mcpTools ?? []).filter((k) => parseToolKey(k)?.serverId !== serverId);
    revoked += (agent.mcpTools ?? []).length - kept.length;
    agent.mcpTools = kept;
  }

  return NextResponse.json({ removed: serverId, grantsRevoked: revoked });
}
