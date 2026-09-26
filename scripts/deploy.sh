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
# [VERIFY before relying on this]: this was written without a funded
# address to test against (faucet was rate-limited throughout the build —
# see BIND_PRD.md's own honesty-register habit). The Move package itself
# is real and fully unit-tested (bind/tests/); this script's CLI
# argument encoding — especially the vector<u8> pubkey arg to
# set_attestor_pubkey — is the one part that has NOT been exercised
# end-to-end and may need a small fix.
set -euo pipefail
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

echo "==> Creating a 5 SUI demo vault (per-tx cap 2 SUI, 60s window)"
COIN_ID=$(sui client gas --json | node -e '
  const d = JSON.parse(require("fs").readFileSync(0,"utf8"));
  console.log(d[0].gasCoinId ?? d[0].id?.id ?? d[0].coinObjectId);
')
SPLIT_JSON=$(sui client split-coin --coin-id "$COIN_ID" --amounts 5000000000 --gas-budget 50000000 --json)
VAULT_COIN_ID=$(echo "$SPLIT_JSON" | node -e '
  const d = JSON.parse(require("fs").readFileSync(0,"utf8"));
  const c = d.objectChanges.find(x => x.type === "created" && x.objectType?.includes("coin::Coin"));
  console.log(c.objectId);
')
AGENT_ADDR=$(sui client active-address)

CREATE_JSON=$(sui client call \
  --package "$PACKAGE_ID" --module allowance_vault --function create_vault \
  --type-args 0x2::sui::SUI \
  --args "$AGENT_ADDR" 2000000000 60000 "$VAULT_COIN_ID" 0x6 \
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
# BIND_EXECUTOR_KEY is a DIFFERENT key from BIND_ATTEST_PRIVKEY above: this
# one signs and submits real transactions (pays gas), the other only signs
# the off-chain attestation message that ed25519_verify checks on-chain.
EXECUTOR_KEY=$(sui keytool export --key-identity "$AGENT_ADDR" --json | node -e '
  const d = JSON.parse(require("fs").readFileSync(0,"utf8"));
  console.log(d.exportedPrivateKey ?? d.privateKey ?? d.key);
')

cat >> .env.local <<EOF

# --- written by scripts/deploy.sh on $(date -u +%FT%TZ) ---
BIND_PACKAGE_ID=$PACKAGE_ID
BIND_REGISTRY_ID=$REGISTRY_ID
BIND_VAULT_ID=$VAULT_ID
BIND_AGENT_CAP_ID=$AGENT_CAP_ID
BIND_EXECUTOR_KEY=$EXECUTOR_KEY
BIND_ATTEST_PRIVKEY=$ATTEST_PRIV
BIND_DEMO_SENDER=$AGENT_ADDR
EOF

echo "==> Done. Appended live config to .env.local"
