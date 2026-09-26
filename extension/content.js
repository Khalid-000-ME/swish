/**
 * Bridge between the page and the extension.
 *
 * The wallet has to be registered on the page's own `window` for the
 * Wallet Standard to see it, and a content script runs in an isolated
 * world — so the registration code is injected into the page itself and
 * talks back through window messages, which this script relays to the
 * background worker.
 */
const script = document.createElement("script");
script.src = chrome.runtime.getURL("inpage.js");
script.async = false;
(document.head || document.documentElement).appendChild(script);
script.remove();

window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  const msg = event.data;
  if (!msg || msg.target !== "swish-content") return;

  try {
    const response = await chrome.runtime.sendMessage({
      type: msg.method,
      payload: msg.payload,
      origin: window.location.origin,
    });
    window.postMessage({ target: "swish-inpage", id: msg.id, response }, window.location.origin);
  } catch (err) {
    window.postMessage(
      { target: "swish-inpage", id: msg.id, response: { error: String(err?.message ?? err) } },
      window.location.origin
    );
  }
});
