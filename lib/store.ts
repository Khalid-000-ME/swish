import type { Declaration, DiffResult, DryRunResult, Intercepta, ScenarioId, VaultState } from "./types";

/**
 * In-memory demo state, process-lifetime only. A real deployment reads
 * pending declarations back from chain (they're objects); this stands in
 * for that so the override round trip (propose -> redirect -> callback)
 * survives across the two HTTP requests it spans in this demo server.
 */
export interface PendingExecution {
  id: string;
  scenario: ScenarioId;
  declaration: Declaration;
  vault: VaultState;
  dryRun: DryRunResult;
  diff: DiffResult;
  intercepta: Intercepta;
  status: "awaiting_human" | "override_executed" | "blocked" | "expired";
  createdAt: number;
}

const g = globalThis as unknown as { __bindStore?: Map<string, PendingExecution> };
export const pendingStore: Map<string, PendingExecution> = g.__bindStore ?? (g.__bindStore = new Map());
