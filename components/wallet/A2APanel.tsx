"use client";

import { useEffect, useState } from "react";
import type { WalletSnapshot } from "./types";
import { EmptyState } from "./bits";

/**
 * Agent-to-agent.
 *
 * Two halves of the same idea. The top is what an *outside* agent needs to
 * reach this wallet — the MCP endpoint, its tools, and the fact that none
 * of them work without a connection the operator approved. The bottom is
 * the same thing from the inside: type what you want done, and an agent
 * works through that identical endpoint, holding a real token, refused by
 * the same guardrails.
 *
 * The console deliberately doesn't call the wallet's internals. If the MCP
 * integration breaks, this screen breaks with it, which is the only way a
 * demo of an integration is worth anything.
 */
interface Mcp {
  endpoint: string;
  protocolVersion: string;
  transport: string;
  auth: string;
  modelConfigured: string[];
}

interface Step {
  tool: string;
  input: unknown;
  output: unknown;
  ok: boolean;
}

type Run =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "done"; narration: string; steps: Step[]; model: string }
  | { kind: "failed"; message: string; steps: Step[] };

const SUGGESTIONS = [
  "What can you actually spend, and what would stop you?",
  "Buy the daily market feed, then tell me what it cost.",
  "Try to pay someone who isn't on the allow-list and tell me what happens.",
  "Summarise everything that got refused today and why.",
];

export function A2APanel({ snap }: { snap: WalletSnapshot }) {
  const [mcp, setMcp] = useState<Mcp | null>(null);
  const [prompt, setPrompt] = useState("");
  const [agentId, setAgentId] = useState(snap.agents[0]?.id ?? "");
  const [run, setRun] = useState<Run>({ kind: "idle" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/a2a")
      .then((r) => r.json())
      .then((d) => alive && setMcp(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const agent = snap.agents.find((a) => a.id === agentId) ?? snap.agents[0];

  async function send(text: string) {
    if (!text.trim() || !agent) return;
    setRun({ kind: "working" });
    try {
      const res = await fetch("/api/a2a", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: text, agentId: agent.id, subAccountId: agent.subAccounts[0]?.id }),
      });
      const body = await res.json();
      if (!res.ok) {
        setRun({ kind: "failed", message: body.error ?? "The run failed.", steps: body.steps ?? [] });
        return;
      }
      setRun({ kind: "done", narration: body.narration, steps: body.steps ?? [], model: body.model });
    } catch (err) {
      setRun({ kind: "failed", message: err instanceof Error ? err.message : String(err), steps: [] });
    }
  }

  const config = mcp
    ? JSON.stringify(
        {
          mcpServers: {
            bind: {
              url: mcp.endpoint,
              headers: { Authorization: "Bearer <token from the Sites screen>" },
            },
          },
        },
        null,
        2
      )
    : "";

  return (
    <div className="space-y-5">
      <header>
        <h1 className="h-wallet text-3xl text-[var(--bind-mist)]">Agent to agent</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--bind-fg-dim)]">
          Other agents reach this wallet over MCP, and get refused by the same rules you set. Below,
          you can do the same thing from here — in a sentence.
        </p>
      </header>

      {/* ───────────────────── the endpoint ───────────────────── */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--bind-line)] px-4 py-3">
          <span className="dot" style={{ background: mcp ? "var(--bind-ok)" : "var(--bind-warn)" }} />
          <span className="text-sm font-medium text-[var(--bind-fg)]">MCP server</span>
          <span className="ml-auto text-[11px] text-[var(--bind-fg-faint)]">
            {mcp ? `protocol ${mcp.protocolVersion}` : "checking…"}
          </span>
        </div>

        <div className="px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-black/35 px-3 py-2 font-mono text-[12px] text-[var(--bind-fg)]">
              {mcp?.endpoint ?? "—"}
            </code>
            <button
              onClick={() => {
                if (config) navigator.clipboard?.writeText(config);
                setCopied(true);
              }}
              className="flex-none rounded-full border border-[var(--bind-line-strong)] px-3.5 py-2 text-[11.5px] text-[var(--bind-fg-dim)] transition hover:text-[var(--bind-fg)]"
            >
              {copied ? "Copied config" : "Copy client config"}
            </button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-5">
            {["list_agents", "get_guardrails", "list_tasks", "propose_payment", "list_activity"].map((t) => (
              <span
                key={t}
                className="rounded-lg border border-[var(--bind-line)] bg-black/20 px-2.5 py-1.5 text-center font-mono text-[10.5px] text-[var(--bind-fg-dim)]"
              >
                {t}
              </span>
            ))}
          </div>

          <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--bind-fg-faint)]">
            Every call needs a bearer token from a connection you approved, scoped to one agent and
            one envelope, with an action budget and an expiry. An unauthenticated call is refused —
            that&apos;s the whole point of it being a wallet rather than an API.
          </p>
        </div>
      </section>

      {/* ───────────────────── the console ───────────────────── */}
      {snap.agents.length === 0 ? (
        <EmptyState title="No agents yet" line="Hire one and you can put it to work from here." />
      ) : (
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-[var(--bind-line)] px-4 py-3">
            <div>
              <div className="text-sm font-medium text-[var(--bind-fg)]">Ask for something</div>
              <div className="text-[11px] text-[var(--bind-fg-faint)]">
                Runs through the endpoint above, with a real token
              </div>
            </div>
            {snap.agents.length > 1 && (
              <select
                value={agent?.id}
                onChange={(e) => setAgentId(e.target.value)}
                className="ml-auto rounded-lg border border-[var(--bind-line-strong)] bg-black/30 px-3 py-1.5 text-[12px] text-[var(--bind-fg)] outline-none focus:border-[var(--bind-accent-2)]"
              >
                {snap.agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="px-4 py-4">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send(prompt);
              }}
              rows={3}
              placeholder={`Ask ${agent?.name ?? "your agent"} to do something…`}
              className="w-full resize-y rounded-xl border border-[var(--bind-line-strong)] bg-black/30 px-3.5 py-3 text-[13px] leading-relaxed text-[var(--bind-fg)] outline-none placeholder:text-[var(--bind-fg-faint)] focus:border-[var(--bind-accent-2)]"
            />

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                disabled={run.kind === "working" || !prompt.trim()}
                onClick={() => send(prompt)}
                className="rounded-full px-4 py-2 text-[12.5px] font-semibold text-[var(--bind-black)] transition disabled:opacity-40"
                style={{ background: "var(--bind-mist)" }}
              >
                {run.kind === "working" ? "Working…" : "Run"}
              </button>
              <span className="text-[11px] text-[var(--bind-fg-faint)]">⌘↵</span>
              {mcp?.modelConfigured?.length ? (
                <span className="ml-auto font-mono text-[10.5px] text-[var(--bind-fg-faint)]">
                  {mcp.modelConfigured[0]}
                </span>
              ) : (
                <span className="ml-auto text-[11px]" style={{ color: "var(--bind-warn)" }}>
                  No model configured — set GROQ_API_KEY
                </span>
              )}
            </div>

            {run.kind === "idle" && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setPrompt(s);
                      send(s);
                    }}
                    className="rounded-full border border-[var(--bind-line)] px-3 py-1.5 text-left text-[11.5px] text-[var(--bind-fg-dim)] transition hover:border-[var(--bind-accent-2)] hover:text-[var(--bind-fg)]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {(run.kind === "done" || run.kind === "failed") && (
              <Transcript run={run} onReset={() => setRun({ kind: "idle" })} />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Transcript({ run, onReset }: { run: Run; onReset: () => void }) {
  const steps = run.kind === "done" || run.kind === "failed" ? run.steps : [];

  return (
    <div className="mt-4 space-y-2.5">
      {steps.map((s, i) => (
        <details
          key={i}
          className="rounded-xl border border-[var(--bind-line)] bg-black/20 px-3.5 py-2.5"
        >
          <summary className="flex cursor-pointer items-center gap-2 text-[12px]">
            <span
              className="dot"
              style={{ background: s.ok ? "var(--bind-ok)" : "var(--bind-danger)" }}
            />
            <span className="font-mono text-[var(--bind-fg)]">{s.tool}</span>
            <span className="ml-auto text-[10.5px] text-[var(--bind-fg-faint)]">
              {s.ok ? "answered" : "refused"}
            </span>
          </summary>
          <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/40 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-[var(--bind-fg-dim)]">
            {JSON.stringify(s.output, null, 2)}
          </pre>
        </details>
      ))}

      {run.kind === "done" && (
        <div className="rounded-xl border border-[var(--bind-line-strong)] bg-black/20 px-4 py-3">
          <p className="text-[13px] leading-relaxed text-[var(--bind-fg)]">{run.narration}</p>
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={onReset}
              className="text-[11px] text-[var(--bind-fg-faint)] underline underline-offset-2 transition hover:text-[var(--bind-fg)]"
            >
              Ask something else
            </button>
            <span className="ml-auto font-mono text-[10.5px] text-[var(--bind-fg-faint)]">
              {run.model}
            </span>
          </div>
        </div>
      )}

      {run.kind === "failed" && (
        <div
          className="rounded-xl border px-4 py-3"
          style={{ borderColor: "var(--bind-danger)", background: "var(--bind-danger-dim)" }}
        >
          <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--bind-danger)" }}>
            {run.message}
          </p>
          <button
            onClick={onReset}
            className="mt-2 text-[11px] text-[var(--bind-fg-faint)] underline underline-offset-2 transition hover:text-[var(--bind-fg)]"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
