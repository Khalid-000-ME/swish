import type { ScenarioId } from "@/lib/types";

export const SCENARIOS: Array<{
  id: ScenarioId;
  label: string;
  tag: string;
  tagColor: string;
  blurb: string;
}> = [
  {
    id: "villain_hidden_effects",
    label: "Hidden effects",
    tag: "Bybit-class · $1.5B",
    tagColor: "var(--swish-danger)",
    blurb: "The declared payment looks routine. The chain would actually also move funds and grant a capability nobody declared.",
  },
  {
    id: "villain_flagged_recipient",
    label: "Flagged recipient",
    tag: "Intercepta",
    tagColor: "var(--swish-danger)",
    blurb: "The agent is honest — it just doesn't know this address is a known drainer cluster.",
  },
  {
    id: "villain_escalation",
    label: "Escalation attempt",
    tag: "Grok/Bankr-class",
    tagColor: "var(--swish-danger)",
    blurb: "An unsolicited object and an encoded instruction try to redirect the payment. Vault config never moves.",
  },
  {
    id: "override_denied",
    label: "Human denies",
    tag: "World ID for Agents",
    tagColor: "var(--swish-warn)",
    blurb: "A novel recipient needs a human. The owner declines — no object is ever minted.",
  },
  {
    id: "happy_path",
    label: "Happy path",
    tag: "Auto-executed",
    tagColor: "var(--swish-ok)",
    blurb: "Clean diff, allow-listed recipient — the agent's routine payment goes straight through.",
  },
];
