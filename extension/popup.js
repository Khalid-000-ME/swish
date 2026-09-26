/**
 * The popup is a frame around the wallet's own /popup route.
 *
 * Rebuilding this view in plain HTML would mean maintaining a second
 * copy of the design system that quietly drifts from the first. The
 * only thing this shell owns is where the wallet lives and what to show
 * when it can't be reached.
 */
const DEFAULT_URL = "http://localhost:3000";
const $ = (id) => document.getElementById(id);

async function walletUrl() {
  const { walletUrl } = await chrome.storage.local.get("walletUrl");
  return walletUrl || DEFAULT_URL;
}

function showFallback(base, why) {
  $("frame").style.display = "none";
  $("fallback").style.display = "block";
  $("url").value = base;
  if (why) $("why").textContent = why;
}

function showFrame(src) {
  $("fallback").style.display = "none";
  $("frame").style.display = "block";
  $("frame").src = src;
}

async function boot() {
  const base = await walletUrl();
  try {
    // Checked before framing it — an iframe that fails to load is a
    // blank rectangle, which tells nobody anything.
    const res = await fetch(`${base}/api/wallet`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    showFrame(`${base}/popup`);
  } catch {
    showFallback(base, `Nothing answered at ${base}.`);
  }
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
  try {
    const res = await fetch(`${next}/api/wallet`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    await chrome.storage.local.set({ walletUrl: next });
    note.innerHTML = `<span class="ok">Found it.</span>`;
    showFrame(`${next}/popup`);
  } catch {
    note.innerHTML = `<span class="bad">No Swish wallet answered at ${next}. Not saved.</span>`;
  } finally {
    button.disabled = false;
  }
});

boot();
