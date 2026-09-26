import type { CoinType, ScenarioId, VaultState } from "@/lib/types";
import { DEMO_ADDRESSES } from "@/fixtures/addresses";

/**
 * In-memory demo state for one run of the agent. A real deployment reads
 * this from the chain; the demo keeps it here so every scenario is
 * reproducible without depending on prior chain state existing.
 */
export class BindSession {
  scenario: ScenarioId;
  vault: VaultState;
  completedTools: string[] = [];
  log: Array<{ tool: string; input: unknown; output: unknown; ts: number }> = [];

  constructor(scenario: ScenarioId) {
    this.scenario = scenario;
    this.vault = {
      // The real on-chain shared Vault<SUI> object id once one has been
      // published + created (see scripts/deploy.sh / .env.local) — a
      // Declaration minted with a mismatched vault_id aborts on-chain
      // with E_WRONG_VAULT, which is exactly how this got caught.
      id: process.env.BIND_VAULT_ID || DEMO_ADDRESSES.vault,
      owner: DEMO_ADDRESSES.owner,
      agent: DEMO_ADDRESSES.agent,
      balance: 10_000_000_000n, // 10 SUI
      coinType: "0x2::sui::SUI" as CoinType,
      allowlist: [DEMO_ADDRESSES.allowlistedMerchant],
      perTxCap: 2_000_000_000n, // 2 SUI
      windowMs: 60_000,
      windowStart: Date.now(),
      windowSpent: 0n,
      frozen: false,
    };
  }

  recipientForScenario(): string {
    switch (this.scenario) {
      case "happy_path":
        return DEMO_ADDRESSES.allowlistedMerchant;
      case "villain_hidden_effects":
        return DEMO_ADDRESSES.allowlistedMerchant; // declared leg looks routine
      case "villain_flagged_recipient":
        return DEMO_ADDRESSES.flaggedScam;
      case "villain_escalation":
        return DEMO_ADDRESSES.novelMerchant;
      case "override_denied":
        return DEMO_ADDRESSES.novelMerchant;
      default:
        return DEMO_ADDRESSES.allowlistedMerchant;
    }
  }

  record(tool: string, input: unknown, output: unknown) {
    this.completedTools.push(tool);
    this.log.push({ tool, input, output, ts: Date.now() });
  }

  nextExpectedTool(order: string[]): string | undefined {
    return order[this.completedTools.length];
  }
}
