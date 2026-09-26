#!/usr/bin/env bash
# Puts SUI into the vault that agents draw from.
#
# There are three separate pots and topping up the wrong one is the usual
# way a demo stalls:
#
#   your key      pays gas for owner operations, and is where the agent
#                 page's "Send 0.2 SUI" comes from. Top up at the faucet.
#   the vault     what agents spend, and what "Top up from the vault"
#                 moves. This script.
#   agent address pays that agent's own transaction gas. Top up from the
#                 agent page.
#
# `deposit` is public on purpose — anyone may fund a vault, no authority
# needed — so this works from any funded address, not only the owner's.
#
#   ./scripts/topup.sh 0.2
set -euo pipefail
cd "$(dirname "$0")/.."

AMOUNT_SUI="${1:-0.2}"
AMOUNT_MIST=$(node -e "process.stdout.write(String(Math.round(Number(process.argv[1]) * 1e9)))" "$AMOUNT_SUI")

# Read ids from .env.local rather than the environment, so this matches
# whatever the dev server is actually running against.
eval "$(grep -E '^SWISH_(PACKAGE|VAULT)_ID=' .env.local)"
: "${SWISH_PACKAGE_ID:?missing from .env.local}" "${SWISH_VAULT_ID:?missing from .env.local}"

ACTIVE=$(sui client active-address)
echo "==> Depositing $AMOUNT_SUI SUI into the vault as $ACTIVE"
echo "    vault   $SWISH_VAULT_ID"

BALANCE_MIST=$(sui client gas --json | node -e '
  const d = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const coins = Array.isArray(d) ? d : (d.gasCoins ?? []);
  console.log(coins.reduce((n, c) => n + Number(c.mistBalance ?? c.balance ?? 0), 0));
')
# Gas for the split and the deposit, generously.
NEEDED=$((AMOUNT_MIST + 30000000))
if [ "$BALANCE_MIST" -lt "$NEEDED" ]; then
  echo "Not enough. Holding $(node -e "console.log($BALANCE_MIST/1e9)") SUI, need about $(node -e "console.log($NEEDED/1e9)")."
  echo "Top this address up first: https://faucet.sui.io/?address=$ACTIVE"
  exit 1
fi

# One programmable transaction: split off the gas coin, hand the result
# straight to deposit.
#
# Doing it as two commands does not work on a single-coin address. `sui
# client split-coin` needs a gas coin that isn't the coin being split, so
# on an address holding one coin it fails with "insufficient SUI balance"
# while sitting on plenty of SUI. Splitting from `gas` inside a PTB has no
# such problem, and it costs one gas payment instead of two.
sui client ptb \
  --split-coins gas "[$AMOUNT_MIST]" \
  --assign deposit_coin \
  --move-call "$SWISH_PACKAGE_ID::allowance_vault::deposit" "<0x2::sui::SUI>" \
    @"$SWISH_VAULT_ID" deposit_coin.0 \
  --gas-budget 20000000

echo "==> Done. The wallet reads the vault's balance from chain, so just reload it."
