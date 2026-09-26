#!/usr/bin/env bash
# Publishes the bind Move package, mints an attestation keypair, wires the
# AttestorRegistry to it, and creates + shares a funded demo Vault<SUI>.
# Writes every resulting id into .env.local so lib/mint.ts's
# isMintConfigured() flips the app from simulated to real on-chain calls.
#
# Requires: `sui` CLI on testnet with a funded active address
# (`sui client gas` should list at least one coin — see the faucet at
# https://faucet.sui.io/?address=<your address> if not).
#
# Sizes are overridable and default to demo scale, not the round numbers
# this script used to hardcode. It asked for a 5 SUI vault with a 2 SUI
# per-payment cap, which failed outright on a testnet key holding less than
# 5 SUI and, when it did run, set a cap forty times larger than anything
# the demo spends (feeds cost 0.02 SUI). A cap that nothing can reach is
# not a cap anyone can see working.
#
#   VAULT_SUI=0.3 PER_TX_CAP_SUI=0.05 ./scripts/deploy.sh
set -euo pipefail

VAULT_SUI="${VAULT_SUI:-0.3}"
PER_TX_CAP_SUI="${PER_TX_CAP_SUI:-0.05}"
WINDOW_MS="${WINDOW_MS:-60000}"
# Publishing, three calls and the split; measured at ~0.09 SUI, doubled.
GAS_HEADROOM_SUI="${GAS_HEADROOM_SUI:-0.25}"

sui_to_mist() { node -e "process.stdout.write(String(Math.round(Number(process.argv[1]) * 1e9)))" "$1"; }
VAULT_MIST=$(sui_to_mist "$VAULT_SUI")
PER_TX_CAP_MIST=$(sui_to_mist "$PER_TX_CAP_SUI")
HEADROOM_MIST=$(sui_to_mist "$GAS_HEADROOM_SUI")

ACTIVE=$(sui client active-address)
echo "==> Preflight: $ACTIVE on $(sui client active-env)"

# Fail here with a number rather than three calls in with a CLI error.
# `sui client gas --json` returns { gasCoins: [...] } on current CLI
# versions and a bare array on older ones. Handle both.
BALANCE_MIST=$(sui client gas --json | node -e '
  const d = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const coins = Array.isArray(d) ? d : (d.gasCoins ?? []);
  console.log(coins.reduce((n, c) => n + Number(c.mistBalance ?? c.balance ?? 0), 0));
')
NEEDED_MIST=$((VAULT_MIST + HEADROOM_MIST))
if [ "$BALANCE_MIST" -lt "$NEEDED_MIST" ]; then
  echo "Not enough SUI. Holding $(node -e "console.log($BALANCE_MIST/1e9)"), need about $(node -e "console.log($NEEDED_MIST/1e9)")."
  echo "Either top up at https://faucet.sui.io/?address=$ACTIVE"
  echo "or run with a smaller vault, e.g. VAULT_SUI=0.1 $0"
  exit 1
fi
echo "    holding $(node -e "console.log($BALANCE_MIST/1e9)") SUI; vault $VAULT_SUI, cap $PER_TX_CAP_SUI"

cd "$(dirname "$0")/../bind"

echo "==> Publishing bind package to $(sui client active-env)"
PUBLISH_JSON=$(sui client publish --skip-dependency-verification --gas-budget 200000000 --json)
echo "$PUBLISH_JSON" > /tmp/bind-publish.json

PACKAGE_ID=$(echo "$PUBLISH_JSON" | node -e '
  const d = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const pub = d.objectChanges.find(c => c.type === "published");
  console.log(pub.packageId);
')
REGISTRY_ID=$(echo "$PUBLISH_JSON" | node -e '
  const d = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const reg = d.objectChanges.find(c => c.type === "created" && c.objectType?.endsWith("::proofs::AttestorRegistry"));
  console.log(reg.objectId);
')
AGENT_CAP_ID=$(echo "$PUBLISH_JSON" | node -e '
  const d = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const cap = d.objectChanges.find(c => c.type === "created" && c.objectType?.endsWith("::agent_cap::AgentCap"));
  console.log(cap.objectId);
')

echo "package: $PACKAGE_ID"
echo "registry: $REGISTRY_ID"
echo "agent cap: $AGENT_CAP_ID"

echo "==> Generating the backend attestation keypair"
cd ..
KEYPAIR_JSON=$(node -e '
const ed = require("@noble/ed25519");
(async () => {
  const priv = ed.utils.randomSecretKey();
  const pub = await ed.getPublicKeyAsync(priv);
  console.log(JSON.stringify({
    priv: Buffer.from(priv).toString("hex"),
    pub: Buffer.from(pub).toString("hex"),
  }));
})();
')
ATTEST_PRIV=$(echo "$KEYPAIR_JSON" | node -e 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).priv)')
ATTEST_PUB=$(echo "$KEYPAIR_JSON" | node -e 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).pub)')
echo "attest pubkey: 0x$ATTEST_PUB"

echo "==> Registering the attestation pubkey on-chain"
# [VERIFY]: vector<u8> CLI encoding — most `sui` CLI versions accept a
# bracketed decimal-byte array for vector<u8> args, e.g. "[16,222,...]".
PUBKEY_BYTES=$(node -e "console.log('[' + Buffer.from('$ATTEST_PUB','hex').join(',') + ']')")
sui client call \
  --package "$PACKAGE_ID" --module proofs --function set_attestor_pubkey \
  --args "$REGISTRY_ID" "$PUBKEY_BYTES" \
  --gas-budget 50000000

echo "==> Creating a $VAULT_SUI SUI vault (per-tx cap $PER_TX_CAP_SUI SUI, ${WINDOW_MS}ms window)"
# Largest coin, not the first one listed — splitting has to come out of a
# coin that can actually cover it.
COIN_ID=$(sui client gas --json | node -e '
  const d = JSON.parse(require("fs").readFileSync(0,"utf8"));
  const coins = Array.isArray(d) ? d : (d.gasCoins ?? []);
  const biggest = coins.slice().sort((a, b) =>
    Number(b.mistBalance ?? b.balance ?? 0) - Number(a.mistBalance ?? a.balance ?? 0))[0];
  console.log(biggest.gasCoinId ?? biggest.id?.id ?? biggest.coinObjectId);
')
SPLIT_JSON=$(sui client split-coin --coin-id "$COIN_ID" --amounts "$VAULT_MIST" --gas-budget 50000000 --json)
VAULT_COIN_ID=$(echo "$SPLIT_JSON" | node -e '
  const d = JSON.parse(require("fs").readFileSync(0,"utf8"));
  const c = d.objectChanges.find(x => x.type === "created" && x.objectType?.includes("coin::Coin"));
  console.log(c.objectId);
')
AGENT_ADDR=$(sui client active-address)

CREATE_JSON=$(sui client call \
  --package "$PACKAGE_ID" --module allowance_vault --function create_vault \
  --type-args 0x2::sui::SUI \
  --args "$AGENT_ADDR" "$PER_TX_CAP_MIST" "$WINDOW_MS" "$VAULT_COIN_ID" 0x6 \
  --gas-budget 100000000 --json)
VAULT_ID=$(echo "$CREATE_JSON" | node -e '
  const d = JSON.parse(require("fs").readFileSync(0,"utf8"));
  const v = d.objectChanges.find(c => c.type === "created" && c.objectType?.includes("::allowance_vault::Vault<"));
  console.log(v.objectId);
')

echo "==> Sharing the vault"
sui client call \
  --package "$PACKAGE_ID" --module allowance_vault --function share \
  --type-args 0x2::sui::SUI \
  --args "$VAULT_ID" \
  --gas-budget 50000000

echo "==> Allow-listing the demo merchant address"
sui client call \
  --package "$PACKAGE_ID" --module allowance_vault --function set_allowlist_add \
  --type-args 0x2::sui::SUI \
  --args "$VAULT_ID" 0xa24a020da022ca0f256400b9fa19223593b81517399dd9fd1239fd7113d2d38a \
  --gas-budget 50000000

echo "==> Exporting the CLI address's own key for lib/mint.ts's executor()"
# SWISH_EXECUTOR_KEY is a DIFFERENT key from SWISH_ATTEST_PRIVKEY above: this
# one signs and submits real transactions (pays gas), the other only signs
# the off-chain attestation message that ed25519_verify checks on-chain.
EXECUTOR_KEY=$(sui keytool export --key-identity "$AGENT_ADDR" --json | node -e '
  const d = JSON.parse(require("fs").readFileSync(0,"utf8"));
  console.log(d.exportedPrivateKey ?? d.privateKey ?? d.key);
')

# Replace in place rather than append. Appending left two SWISH_PACKAGE_ID
# lines in the file and relied on the reader taking the last one, which is
# a parser detail to be betting a demo on.
node -e '
const fs = require("fs");
const path = ".env.local";
const next = {
  SWISH_PACKAGE_ID: process.argv[1],
  SWISH_REGISTRY_ID: process.argv[2],
  SWISH_VAULT_ID: process.argv[3],
  SWISH_AGENT_CAP_ID: process.argv[4],
  SWISH_EXECUTOR_KEY: process.argv[5],
  SWISH_ATTEST_PRIVKEY: process.argv[6],
  SWISH_DEMO_SENDER: process.argv[7],
};
let lines = fs.existsSync(path) ? fs.readFileSync(path, "utf8").split("\n") : [];
for (const [k, v] of Object.entries(next)) {
  const i = lines.findIndex((l) => l.startsWith(k + "="));
  if (i >= 0) lines[i] = `${k}=${v}`;
  else lines.push(`${k}=${v}`);
}
fs.writeFileSync(path, lines.join("\n").replace(/\n+$/, "") + "\n");
' "$PACKAGE_ID" "$REGISTRY_ID" "$VAULT_ID" "$AGENT_CAP_ID" "$EXECUTOR_KEY" "$ATTEST_PRIV" "$AGENT_ADDR"

echo "==> Done."
echo "    package $PACKAGE_ID"
echo "    vault   $VAULT_ID  ($VAULT_SUI SUI, cap $PER_TX_CAP_SUI)"
echo "    Restart the dev server so it picks up the new .env.local."
