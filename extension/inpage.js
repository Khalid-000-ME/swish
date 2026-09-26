/**
 * Registers Bind on the page as a Sui wallet.
 *
 * This implements the Wallet Standard's registration handshake by hand —
 * dispatching `wallet-standard:register-wallet` and answering
 * `wallet-standard:app-ready` — rather than importing the package,
 * because an injected page script can't use npm imports without a
 * bundler and the handshake itself is only a few lines.
 *
 * What Bind reports as an "account" is an *agent's* address, not the
 * operator's. A site connecting here is connecting to an agent that
 * spends from a bounded envelope, and every transaction it asks for is
 * simulated and checked before anything is signed. A site can be
 * refused, and should expect it.
 */
(() => {
  const SUI_CHAINS = ["sui:testnet", "sui:mainnet", "sui:devnet"];

  let accounts = [];
  const listeners = new Set();

  // --- page <-> content script plumbing -----------------------------------
  let nextId = 1;
  const pending = new Map();

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.target !== "bind-inpage") return;
    const resolve = pending.get(msg.id);
    if (resolve) {
      pending.delete(msg.id);
      resolve(msg.response);
    }
  });

  function call(method, payload) {
    return new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      window.postMessage({ target: "bind-content", id, method, payload }, window.location.origin);
    });
  }

  function emitChange() {
    for (const listener of listeners) listener({ accounts });
  }

  function toAccount(agent) {
    return {
      address: agent.address,
      publicKey: new Uint8Array(),
      chains: SUI_CHAINS,
      features: [
        "sui:signTransaction",
        "sui:signAndExecuteTransaction",
        "sui:signPersonalMessage",
      ],
      label: `${agent.name} — ${agent.role}`,
      icon: undefined,
    };
  }

  // --- the wallet ---------------------------------------------------------
  const wallet = {
    version: "1.0.0",
    name: "Bind",
    icon:
      "data:image/svg+xml;base64," +
      btoa(
        `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#05070c"/><circle cx="32" cy="32" r="14" fill="none" stroke="#4f7bf0" stroke-width="5"/></svg>`
      ),
    get chains() {
      return SUI_CHAINS;
    },
    get accounts() {
      return accounts;
    },
    features: {
      "standard:connect": {
        version: "1.0.0",
        connect: async () => {
          const res = await call("connect", { origin: window.location.origin });
          if (res?.error) throw new Error(res.error);
          accounts = (res.agents ?? []).map(toAccount);
          emitChange();
          return { accounts };
        },
      },

      "standard:disconnect": {
        version: "1.0.0",
        disconnect: async () => {
          await call("disconnect", {});
          accounts = [];
          emitChange();
        },
      },

      "standard:events": {
        version: "1.0.0",
        on: (event, listener) => {
          if (event !== "change") return () => {};
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },

      "sui:signAndExecuteTransaction": {
        version: "2.0.0",
        signAndExecuteTransaction: async ({ transaction }) => {
          // The bytes are simulated and checked server-side before
          // anything is signed; a refusal comes back as an error, which
          // is the wallet doing its job rather than failing.
          const bytes = await transaction.toJSON?.() ?? transaction;
          const res = await call("signAndExecute", { transaction: bytes });
          if (res?.error) throw new Error(res.error);
          if (res?.outcome === "blocked") {
            throw new Error(
              `Bind refused this transaction: ${Array.isArray(res.why) ? res.why.join(" ") : res.why}`
            );
          }
          return {
            digest: res.digest,
            bytes: res.bytes,
            signature: res.signature ?? "",
            effects: res.effects ?? "",
          };
        },
      },

      "sui:signTransaction": {
        version: "2.0.0",
        signTransaction: async () => {
          // Signing without executing would hand back a signature Bind
          // can no longer stand behind — the transaction could be held
          // and broadcast later, after the checks stopped being true.
          throw new Error(
            "Bind does not sign transactions it doesn't execute. Use signAndExecuteTransaction."
          );
        },
      },

      "sui:signPersonalMessage": {
        version: "1.1.0",
        signPersonalMessage: async ({ message }) => {
          const res = await call("signPersonalMessage", {
            message: btoa(String.fromCharCode(...new Uint8Array(message))),
          });
          if (res?.error) throw new Error(res.error);
          return { bytes: res.bytes, signature: res.signature };
        },
      },
    },
  };

  // --- Wallet Standard registration ---------------------------------------
  function register({ register: doRegister }) {
    try {
      doRegister(wallet);
    } catch {
      /* another registrar already has it */
    }
  }

  window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: register }));
  window.addEventListener("wallet-standard:app-ready", (event) => register(event.detail));
})();
