"use client";

import { useState } from "react";
import type { Agent, McpServerView, WalletSnapshot } from "./types";

/**
 * MCP servers your agents call out to, and which of their tools each agent
 * may use.
 *
 * The grant is the tool set, not a filter over it: the agent loop is built
 * from exactly what was ticked here, so an unticked tool isn't something a
 * model can decide to call. That's why this screen is worth having rather
 * than being a list of servers with a note about trusting them.
 *
 * Adding a server probes it immediately. A URL that doesn't answer with a
 * tool list is refused here, not stored as a row that quietly does nothing
 * until an agent reaches for it mid-run.
 */
export function McpServers({
  snap,
  onChanged,
}: {
  snap: WalletSnapshot;
  onChanged: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [authHeader, setAuthHeader] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const servers = snap.mcpServers ?? [];

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet/mcp-servers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, url, authHeader }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not add that server.");
      setLabel("");
      setUrl("");
      setAuthHeader("");
      setAdding(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function act(body: Record<string, unknown>, method: "PATCH" | "DELETE") {
    await fetch("/api/wallet/mcp-servers", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    await onChanged();
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--swish-line)] px-4 py-3">
        <div>
          <div className="text-sm font-medium text-[var(--swish-fg)]">Tools your agents can use</div>
          <div className="text-[11px] text-[var(--swish-fg-faint)]">
            MCP servers they connect out to
          </div>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="btn btn-secondary btn-sm ml-auto">
            Add a server
          </button>
        )}
      </div>

      {adding && (
        <div className="border-b border-[var(--swish-line)] px-4 py-4">
          <div className="grid gap-2.5 sm:grid-cols-[1fr_2fr]">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Name it"
              className="rounded-lg border border-[var(--swish-line-strong)] surface-inset px-3 py-2 text-[13px] text-[var(--swish-fg)] outline-none placeholder:text-[var(--swish-fg-faint)] focus:border-[var(--swish-accent-2)]"
            />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/mcp"
              spellCheck={false}
              className="rounded-lg border border-[var(--swish-line-strong)] surface-inset px-3 py-2 font-mono text-[12px] text-[var(--swish-fg)] outline-none placeholder:text-[var(--swish-fg-faint)] focus:border-[var(--swish-accent-2)]"
            />
          </div>
          <input
            value={authHeader}
            onChange={(e) => setAuthHeader(e.target.value)}
            placeholder="Authorization header, if it needs one — Bearer …"
            spellCheck={false}
            className="mt-2.5 w-full rounded-lg border border-[var(--swish-line-strong)] surface-inset px-3 py-2 font-mono text-[12px] text-[var(--swish-fg)] outline-none placeholder:text-[var(--swish-fg-faint)] focus:border-[var(--swish-accent-2)]"
          />

          <div className="mt-3 flex gap-2">
            <button disabled={busy || !url.trim()} onClick={add} className="btn btn-primary btn-sm">
              {busy ? "Connecting…" : "Connect"}
            </button>
            <button onClick={() => setAdding(false)} className="btn btn-secondary btn-sm">
              Cancel
            </button>
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-[var(--swish-fg-faint)]">
            {error ? (
              <span style={{ color: "var(--swish-danger)" }}>{error}</span>
            ) : (
              "Swish asks the server what tools it has before saving it, so a URL that doesn't answer is refused now rather than mid-run. The header is kept server-side and never sent to your browser."
            )}
          </p>
        </div>
      )}

      {servers.length === 0 ? (
        <p className="px-4 py-5 text-[12.5px] leading-relaxed text-[var(--swish-fg-faint)]">
          No servers yet. Your agents can read their own limits and propose payments without one —
          this is for giving them something else to do, like searching or fetching.
        </p>
      ) : (
        <div className="divide-y divide-[var(--swish-line)]">
          {servers.map((server) => (
            <ServerRow
              key={server.id}
              server={server}
              agents={snap.agents}
              onRefresh={() => act({ serverId: server.id, action: "refresh" }, "PATCH")}
              onRemove={() => act({ serverId: server.id }, "DELETE")}
              onGrant={(agentId, tools) => act({ agentId, tools }, "PATCH")}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ServerRow({
  server,
  agents,
  onRefresh,
  onRemove,
  onGrant,
}: {
  server: McpServerView;
  agents: Agent[];
  onRefresh: () => Promise<void>;
  onRemove: () => Promise<void>;
  onGrant: (agentId: string, tools: string[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  /** Flipping one tool rewrites that agent's whole grant list. */
  async function toggle(agent: Agent, key: string, on: boolean) {
    const current = agent.mcpTools ?? [];
    const next = on ? [...new Set([...current, key])] : current.filter((k) => k !== key);
    await run(() => onGrant(agent.id, next));
  }

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="dot"
          style={{ background: server.error ? "var(--swish-danger)" : "var(--swish-ok)" }}
        />
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-[var(--swish-fg)]">{server.label}</div>
          <div className="truncate font-mono text-[11px] text-[var(--swish-fg-faint)]">
            {server.url}
          </div>
        </div>

        <span className="ml-auto text-[11px] text-[var(--swish-fg-faint)]">
          <span className="font-num">{server.tools.length}</span> tool
          {server.tools.length === 1 ? "" : "s"}
          {server.hasAuth && " · authed"}
        </span>

        <button
          onClick={() => setOpen((o) => !o)}
          className="btn btn-secondary btn-sm"
          disabled={server.tools.length === 0}
        >
          {open ? "Hide" : "Permissions"}
        </button>
        <button disabled={busy} onClick={() => run(onRefresh)} className="btn btn-ghost btn-sm">
          {busy ? "…" : "Refresh"}
        </button>
        <button disabled={busy} onClick={() => run(onRemove)} className="btn btn-ghost btn-sm">
          Remove
        </button>
      </div>

      {server.error && (
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--swish-danger)" }}>
          Last check failed: {server.error}
        </p>
      )}

      {open && (
        <div className="mt-3 space-y-3">
          {agents.length === 0 ? (
            <p className="text-[11.5px] text-[var(--swish-fg-faint)]">
              Hire an agent and you can grant it these.
            </p>
          ) : (
            agents.map((agent) => (
              <div key={agent.id} className="card-raised p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: agent.accent }} />
                  <span className="text-[12.5px] font-medium text-[var(--swish-fg)]">
                    {agent.name}
                  </span>
                  <span className="ml-auto text-[10.5px] text-[var(--swish-fg-faint)]">
                    <span className="font-num">
                      {(agent.mcpTools ?? []).filter((k) => k.startsWith(`${server.id}::`)).length}
                    </span>{" "}
                    of <span className="font-num">{server.tools.length}</span>
                  </span>
                </div>

                <div className="grid gap-1.5 sm:grid-cols-2">
                  {server.tools.map((t) => {
                    const key = `${server.id}::${t.name}`;
                    const granted = (agent.mcpTools ?? []).includes(key);
                    return (
                      <label
                        key={t.name}
                        title={t.description}
                        className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 transition hover:bg-[var(--swish-surface-2)]"
                      >
                        <input
                          type="checkbox"
                          checked={granted}
                          disabled={busy}
                          onChange={(e) => toggle(agent, key, e.target.checked)}
                          className="mt-0.5 h-3.5 w-3.5 flex-none accent-[var(--swish-accent-2)]"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-[11.5px] text-[var(--swish-fg)]">
                            {t.name}
                          </span>
                          {t.description && (
                            <span className="block truncate text-[10.5px] text-[var(--swish-fg-faint)]">
                              {t.description}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))
          )}

          <p className="text-[11px] leading-relaxed text-[var(--swish-fg-faint)]">
            A granted tool can look things up. It cannot move money — paying still goes through a
            declaration, a diff and the vault, whatever an outside server returns.
          </p>
        </div>
      )}
    </div>
  );
}
