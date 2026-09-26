/**
 * The extension's service worker.
 *
 * Holds the connection token per origin and talks to the Swish server.
 * It deliberately holds no signing key: agent secrets stay sealed on the
 * server, and this worker's job is to route a site's request there and
 * carry the answer back. A browser extension is not a good place to keep
 * something that can move money.
 */

const DEFAULT_WALLET_URL = "http://localhost:3000";

async function walletUrl() {
  const { walletUrl } = await chrome.storage.local.get("walletUrl");
  return walletUrl || DEFAULT_WALLET_URL;
}

async function tokenFor(origin) {
  const { connections = {} } = await chrome.storage.local.get("connections");
  return connections[origin] ?? null;
}

async function storeToken(origin, token, agents) {
  const { connections = {} } = await chrome.storage.local.get("connections");
  connections[origin] = token;
  const { agentsByOrigin = {} } = await chrome.storage.local.get("agentsByOrigin");
  agentsByOrigin[origin] = agents ?? [];
  await chrome.storage.local.set({ connections, agentsByOrigin });
}

async function clearToken(origin) {
  const { connections = {} } = await chrome.storage.local.get("connections");
  delete connections[origin];
  await chrome.storage.local.set({ connections });
}

/** Opens the approval screen and waits for the operator to decide. */
async function requestConnection(origin) {
  const base = await walletUrl();

  const started = await fetch(`${base}/api/connect`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ origin, reason: `${origin} wants to use one of your agents` }),
  }).then((r) => r.json());

  if (!started?.requestId) throw new Error(started?.error ?? "Could not reach the Swish wallet.");

  const tab = await chrome.tabs.create({ url: `${base}/connect?request=${started.requestId}` });

  // Poll until the operator approves, rejects, or the request ages out.
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1200));
    const status = await fetch(`${base}/api/connect?request=${started.requestId}`).then((r) => r.json());

    if (status.status === "approved" && status.token) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        /* the operator may have closed it already */
      }
      return status;
    }
    if (status.status === "rejected") throw new Error("You rejected the connection.");
    if (status.status === "expired") throw new Error("The connection request expired.");
  }
  throw new Error("The connection request timed out.");
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const origin = msg.origin ?? new URL(sender.tab?.url ?? "https://unknown").origin;
    const base = await walletUrl();

    try {
      switch (msg.type) {
        case "connect": {
          let token = await tokenFor(origin);

          // An existing token may have expired or been revoked in the
          // wallet, so it's checked rather than trusted.
          if (token) {
            const check = await fetch(`${base}/api/connect?token=${token}`, { headers: { origin } }).then((r) =>
              r.json()
            );
            if (!check.valid) {
              await clearToken(origin);
              token = null;
            }
          }

          if (!token) {
            const approved = await requestConnection(origin);
            token = approved.token;
            await storeToken(origin, token, approved.agents);
          }

          const state = await fetch(`${base}/api/mcp`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${token}`, origin },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "tools/call",
              params: { name: "list_agents", arguments: {} },
            }),
          }).then((r) => r.json());

          const parsed = JSON.parse(state?.result?.content?.[0]?.text ?? "{}");
          sendResponse({ agents: parsed.agents ?? [] });
          return;
        }

        case "disconnect":
          await clearToken(origin);
          sendResponse({ ok: true });
          return;

        // Sign-only and sign-and-broadcast take the same road: the
        // checks are identical, and only the last step differs.
        case "signTransaction":
        case "signAndExecute": {
          const token = await tokenFor(origin);
          if (!token) {
            sendResponse({ error: "Not connected. Call connect first." });
            return;
          }

          const res = await fetch(`${base}/api/extension/sign`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${token}`, origin },
            body: JSON.stringify({
              transaction: msg.payload.transaction,
              mode: msg.type === "signTransaction" ? "sign" : "signAndExecute",
            }),
          });
          sendResponse(await res.json());
          return;
        }

        case "signPersonalMessage":
          // Not wired yet — saying so beats returning something that
          // looks like a signature and isn't.
          sendResponse({ error: "Swish does not sign personal messages yet." });
          return;

        default:
          sendResponse({ error: `Unknown request: ${msg.type}` });
      }
    } catch (err) {
      sendResponse({ error: String(err?.message ?? err) });
    }
  })();

  return true; // keep the channel open for the async reply
});
