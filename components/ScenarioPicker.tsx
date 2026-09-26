"use client";

import { SCENARIOS } from "./scenarios";
import type { ScenarioId } from "@/lib/types";

export function ScenarioPicker({
  active,
  disabled,
  onPick,
}: {
  active: ScenarioId | null;
  disabled: boolean;
  onPick: (id: ScenarioId) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
      {SCENARIOS.map((s) => (
        <button
          key={s.id}
          disabled={disabled}
          onClick={() => onPick(s.id)}
          className="card group flex flex-col items-start gap-2 p-4 text-left transition disabled:opacity-50"
          style={{
            borderColor: active === s.id ? s.tagColor : undefined,
            background: active === s.id ? "var(--bind-surface-2)" : undefined,
          }}
        >
          <span className="chip text-[10px]" style={{ color: s.tagColor, borderColor: s.tagColor }}>
            {s.tag}
          </span>
          <span className="text-sm font-semibold text-[var(--bind-fg)]">{s.label}</span>
          <span className="text-xs leading-snug text-[var(--bind-fg-faint)]">{s.blurb}</span>
        </button>
      ))}
    </div>
  );
}
