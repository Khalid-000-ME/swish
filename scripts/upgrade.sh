#!/usr/bin/env bash
# Upgrades the already-published bind package in place.
#
# Use this, not deploy.sh, once bind has been published to an environment.
# A fresh publish mints a new package with a new type identity, which
# orphans the existing shared Vault<SUI> — its funds, its allow-list and
# every id in .env.local — for no reason. An upgrade adds new public
# functions while the original type identity is preserved, so the vault
# that's already out there keeps working and keeps its allow-list.
#
# Only BIND_PACKAGE_ID changes: calls target the newest package address,
# while objects keep the original one in their type. Everything else in
# .env.local is left alone.
#
# Requires the UpgradeCap recorded in bind/Published.toml, held by the
# publishing address.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

ACTIVE=$(sui client active-address)
echo "==> Upgrading as $ACTIVE on $(sui client active-env)"

UPGRADE_CAP=$(node -e '
  const fs = require("fs");
  const toml = fs.readFileSync("bind/Published.toml", "utf8");
  const m = toml.match(/upgrade-capability\s*=\s*"(0x[0-9a-f]+)"/i);
  if (!m) { console.error("No upgrade-capability in bind/Published.toml — has this ever been published?"); process.exit(1); }
  console.log(m[1]);
')
BEFORE=$(node -e '
  const m = require("fs").readFileSync("bind/Published.toml", "utf8").match(/published-at\s*=\s*"(0x[0-9a-f]+)"/i);
  console.log(m ? m[1] : "unknown");
')
echo "    upgrade cap  $UPGRADE_CAP"
echo "    current      $BEFORE"

cd bind
UPGRADE_JSON=$(sui client upgrade --upgrade-capability "$UPGRADE_CAP" \
  --skip-dependency-verification --gas-budget 200000000 --json)
echo "$UPGRADE_JSON" > /tmp/bind-upgrade.json

PACKAGE_ID=$(echo "$UPGRADE_JSON" | node -e '
  const d = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const pub = (d.objectChanges ?? []).find(c => c.type === "published");
  if (!pub) { console.error("No published entry in the upgrade result; see /tmp/bind-upgrade.json"); process.exit(1); }
  console.log(pub.packageId);
')
cd "$ROOT"

echo "    new          $PACKAGE_ID"

# Only the package id moves. The vault, the registry, the agent cap and
# both keys are unaffected by an upgrade, so they are not touched here.
node -e '
const fs = require("fs");
const path = ".env.local";
const lines = fs.readFileSync(path, "utf8").split("\n");
const i = lines.findIndex((l) => l.startsWith("BIND_PACKAGE_ID="));
const line = `BIND_PACKAGE_ID=${process.argv[1]}`;
if (i >= 0) lines[i] = line; else lines.push(line);
fs.writeFileSync(path, lines.join("\n").replace(/\n+$/, "") + "\n");
' "$PACKAGE_ID"

echo "==> Done. BIND_PACKAGE_ID updated; every other id is unchanged."
echo "    Restart the dev server to pick it up."
