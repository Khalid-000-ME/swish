"use client";

import { useMemo, useRef, useState } from "react";
import { marked } from "marked";
import type { Agent } from "./types";

/**
 * The agent's brief, edited in place.
 *
 * Every other thing you can set about an agent is a number. This is the
 * one place the job gets described in words, and the words are load-bearing
 * — they go to the model as instructions before every run, which is why
 * the editor says so rather than looking like a notes field.
 *
 * Markdown is rendered with `marked` and inserted as HTML. That is only
 * safe because the author is the operator themselves, editing their own
 * wallet: the brief is never fetched from a site, never written by an
 * agent, and never shown to anyone else. If it ever becomes something a
 * third party can set, this needs sanitising first.
 */
const TABS = [
  { id: "write", label: "Write" },
  { id: "preview", label: "Preview" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export function AgentBrief({ agent, onChanged }: { agent: Agent; onChanged: () => Promise<void> }) {
  const [tab, setTab] = useState<Tab>("write");
  const [draft, setDraft] = useState(agent.brief ?? "");
  const [baseline, setBaseline] = useState(agent.brief ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  // A brief that changed on the server — saved here, or edited in another
  // tab — should be adopted, but not over the top of someone's typing.
  // Adjusting state during render is React's own answer to deriving from
  // props; an effect would paint the stale value first.
  const dirty = draft !== baseline;
  if (agent.brief !== baseline && !dirty) {
    setBaseline(agent.brief ?? "");
    setDraft(agent.brief ?? "");
  }

  const rendered = useMemo(() => marked.parse(draft || "_Nothing written yet._"), [draft]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet/agent", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: agent.id, brief: draft }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not save the brief.");
      // The draft is now what the server holds, so it becomes the
      // baseline — otherwise the button would keep reading "Save".
      setBaseline(draft);
      setSavedAt(body.savedAt as number);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  /** ⌘/Ctrl+S saves, because this is an editor and people expect it to. */
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      if (dirty && !saving) save();
      return;
    }
    // Tab indents rather than escaping the field — this is a document,
    // and leaving mid-list is more disruptive than not indenting.
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: start, selectionEnd: end } = el;
      setDraft(draft.slice(0, start) + "  " + draft.slice(end));
      requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2));
    }
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--bind-line)] px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-[var(--bind-fg)]">Brief</div>
          <div className="text-[11px] text-[var(--bind-fg-faint)]">
            Read by the model before every run
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1 rounded-full border border-[var(--bind-line)] p-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="rounded-full px-3 py-1 text-[12px] transition"
              style={
                tab === t.id
                  ? { background: "var(--bind-surface-2)", color: "var(--bind-fg)" }
                  : { color: "var(--bind-fg-faint)" }
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          disabled={!dirty || saving}
          onClick={save}
          className="rounded-full px-4 py-1.5 text-[12px] font-semibold text-[var(--bind-black)] transition disabled:opacity-40"
          style={{ background: "var(--bind-mist)" }}
        >
          {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
      </div>

      {tab === "write" ? (
        <textarea
          ref={textarea}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          rows={18}
          placeholder="# What this agent is for…"
          className="block w-full resize-y bg-black/25 px-4 py-4 font-mono text-[12px] leading-relaxed text-[var(--bind-fg)] outline-none placeholder:text-[var(--bind-fg-faint)]"
        />
      ) : (
        <div
          className="brief-preview px-5 py-4"
          dangerouslySetInnerHTML={{ __html: rendered as string }}
        />
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--bind-line)] px-4 py-2.5">
        <span className="text-[11px] text-[var(--bind-fg-faint)]">
          {draft.length.toLocaleString()} characters
          {dirty && " · unsaved"}
        </span>

        {error ? (
          <span className="text-[11px]" style={{ color: "var(--bind-danger)" }}>
            {error}
          </span>
        ) : savedAt && !dirty ? (
          <span className="text-[11px]" style={{ color: "var(--bind-ok)" }}>
            Saved — the next run reads this.
          </span>
        ) : null}

        <span className="ml-auto text-[11px] text-[var(--bind-fg-faint)]">
          Shapes what it intends. Caps decide what it can do.
        </span>
      </div>
    </section>
  );
}
