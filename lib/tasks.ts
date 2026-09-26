import type { ScenarioId } from "./types";

/**
 * What an operator actually asks an agent to do. Each task is an ordinary
 * instruction — the difference between them isn't the *ask*, it's what the
 * agent runs into while carrying it out. That's the honest framing: you
 * don't choose "run the attack scenario," you give your agent a normal job
 * and the environment is sometimes hostile.
 */
export interface AgentTask {
  id: string;
  label: string;
  detail: string;
  scenario: ScenarioId;
  /** Surfaced in the composer so nothing about the demo is hidden. */
  environment: string;
}

export const TASKS: AgentTask[] = [
  {
    id: "routine-feed",
    label: "Buy today's market-data feed",
    detail: "Routine purchase from a counterparty already on this envelope's allow-list.",
    scenario: "happy_path",
    environment: "Clean environment.",
  },
  {
    id: "tampered-builder",
    label: "Buy today's market-data feed",
    detail: "Same instruction — but the transaction builder in this agent's toolchain has been tampered with.",
    scenario: "villain_hidden_effects",
    environment: "The built transaction carries effects the agent never declared.",
  },
  {
    id: "new-vendor",
    label: "Pay the vendor that just invoiced us",
    detail: "A counterparty the agent has no history with is requesting payment.",
    scenario: "villain_flagged_recipient",
    environment: "The address belongs to a known drainer cluster.",
  },
  {
    id: "poisoned-feed",
    label: "Buy the feed, then act on what it says",
    detail: "The agent reads data it purchased and acts on it — the Grok/Bankr pattern.",
    scenario: "villain_escalation",
    environment: "The purchased feed carries an embedded instruction redirecting payment.",
  },
];

export function findTask(id: string): AgentTask | undefined {
  return TASKS.find((t) => t.id === id);
}
