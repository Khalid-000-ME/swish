/**
 * The popup is a status view, not a second wallet — anything that moves
 * money opens the real one.
 *
 * Two things it has to get right that the first version didn't: the
 * server URL is labelled as a server URL rather than an "address"
 * (which reads as a blockchain address and isn't one), and Save says
 * what it did, because a control that silently succeeds is
 * indistinguishable from one that's broken.
 */
const $ = (id) => document.getElementById(id);
const DEFAULT_URL = "http://localhost:3000";

async function walletUrl() {
  const { walletUrl } = await chrome.storage.local.get("walletUrl");
  return walletUrl || DEFAULT_URL;
}

const short = (a) => (a && a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a ?? "");
const sui = (mist) => (Number(mist || 0) / 1e9).toFixed(3);

async function copy(text, el) {
  try {
    await navigator.clipboard.writeText(text);
    const was = el.textContent;
    el.textContent = "copied";
    setTimeout(() => (el.textContent = was), 900);
  } catch {
    /* clipboard can be blocked; the address is still selectable */
  }
}

function wireCopies() {
  document.querySelectorAll("[data-copy]").forEach((el) => {
    el.addEventListener("click", () => copy(el.dataset.copy, el));
  });
}

async function render() {
  const base = await walletUrl();
  $("url").value = base;

  let snap;
  try {
    snap = await fetch(`${base}/api/wallet`, { cache: "no-store" }).then((r) => r.json());
  } catch {
    $("status").innerHTML = `<span class="bad">unreachable</span>`;
    $("body").innerHTML = `
      <div class="card">
        <div class="empty">
          Can't reach your wallet at <strong>${base}</strong>.<br />
          Start it with <code>npm run dev</code>, or set the right address under Settings below.
        </div>
      </div>`;
    $("settings").open = true;
    return;
  }

  $("status").innerHTML = snap.chainLive
    ? `<span class="ok">testnet · live</span>`
    : `<span class="warn">simulated</span>`;

  if (!snap.onboarding?.complete) {
    $("body").innerHTML = `
      <div class="card">
        <div class="empty">This wallet hasn't been set up yet.</div>
        <button id="setup">Set up wallet</button>
      </div>`;
    $("setup").addEventListener("click", () => chrome.tabs.create({ url: `${base}/onboarding` }));
    return;
  }

  const { connections = {} } = await chrome.storage.local.get("connections");
  const origins = Object.keys(connections);

  $("body").innerHTML = `
    <div class="card">
      <div class="label">Your address</div>
      <div class="total">${sui(snap.holdings?.total)} SUI</div>
      <span class="addr" data-copy="${snap.operator?.address ?? ""}">${short(snap.operator?.address)}</span>
      <div class="note">
        ${sui(snap.holdings?.vault)} in envelopes · ${sui(snap.holdings?.agents)} held by agents
      </div>
    </div>

    ${
      (snap.agents ?? []).length === 0
        ? `<div class="card"><div class="empty">No agents yet.</div></div>`
        : snap.agents
            .map(
              (a) => `
      <div class="card">
        <div class="row">
          <span class="name">${a.name}</span>
          <span class="bal">${sui(a.addressBalanceMist)} SUI</span>
        </div>
        <span class="addr" data-copy="${a.address}">${short(a.address)}</span>
        <div class="note">${a.role}${a.status !== "active" ? ` · <span class="bad">${a.status}</span>` : ""}</div>
      </div>`
            )
            .join("")
    }

    ${
      origins.length
        ? `<div class="card">
             <div class="label" style="margin-bottom:6px">Connected sites</div>
             ${origins.map((o) => `<div class="site"><span>${o}</span></div>`).join("")}
           </div>`
        : ""
    }

    <button class="ghost" id="open">Open full wallet</button>
  `;

  $("open").addEventListener("click", () => chrome.tabs.create({ url: `${base}/wallet` }));
  wireCopies();
}

$("save").addEventListener("click", async () => {
  const button = $("save");
  const note = $("saveNote");
  const next = $("url").value.trim().replace(/\/$/, "");

  if (!next) {
    note.innerHTML = `<span class="bad">Enter the address your wallet is running on.</span>`;
    return;
  }

  button.disabled = true;
  note.textContent = "Checking…";

  // Saving a server we can't reach would fail later and look like a
  // different problem, so it's checked before it's stored.
  try {
    const res = await fetch(`${next}/api/wallet`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    await chrome.storage.local.set({ walletUrl: next });
    note.innerHTML = `<span class="ok">Saved — wallet found.</span>`;
    await render();
  } catch {
    note.innerHTML = `<span class="bad">No Bind wallet answered at ${next}. Not saved.</span>`;
  } finally {
    button.disabled = false;
  }
});

render();
