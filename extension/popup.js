/** The popup is a status view, not a second wallet — anything that
 *  changes money opens the real one. */
const $ = (id) => document.getElementById(id);
const DEFAULT_URL = "http://localhost:3000";

async function walletUrl() {
  const { walletUrl } = await chrome.storage.local.get("walletUrl");
  return walletUrl || DEFAULT_URL;
}

function short(a) {
  return a && a.length > 14 ? `${a.slice(0, 7)}…${a.slice(-5)}` : a ?? "";
}

async function render() {
  const base = await walletUrl();
  $("url").value = base;

  try {
    const snap = await fetch(`${base}/api/wallet`, { cache: "no-store" }).then((r) => r.json());
    $("status").textContent = snap.chainLive ? "testnet · live" : "simulated";

    $("agents").innerHTML =
      (snap.agents ?? []).length === 0
        ? `<div class="empty">No agents yet. Open the wallet to hire one.</div>`
        : snap.agents
            .map(
              (a) => `
        <div class="card">
          <div class="row">
            <span class="name">${a.name}</span>
            <span class="bal">${(Number(a.addressBalanceMist) / 1e9).toFixed(3)} SUI</span>
          </div>
          <div class="addr">${short(a.address)}</div>
        </div>`
            )
            .join("");

    const { connections = {} } = await chrome.storage.local.get("connections");
    const origins = Object.keys(connections);
    $("sites").innerHTML = origins.length
      ? `<div class="card"><div class="muted" style="margin-bottom:6px">Connected sites</div>${origins
          .map((o) => `<div class="name" style="font-size:12px">${o}</div>`)
          .join("")}</div>`
      : "";
  } catch {
    $("status").textContent = "wallet unreachable";
    $("agents").innerHTML = `<div class="empty">Can't reach the wallet at ${base}. Is it running?</div>`;
  }
}

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({ walletUrl: $("url").value.trim().replace(/\/$/, "") });
  render();
});

$("open").addEventListener("click", async () => {
  chrome.tabs.create({ url: `${await walletUrl()}/wallet` });
});

render();
