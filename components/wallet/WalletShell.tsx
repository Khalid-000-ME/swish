"use client";

import { useCallback, useEffect, useState } from "react";
import type { WalletSnapshot } from "./types";

const STORAGE_KEY = "swish:wallet";

/** The slice worth keeping — queues and flags are derived server-side. */
function persistable(snap: WalletSnapshot) {
  return {
    onboarding: snap.onboarding,
    operator: snap.operator,
    agents: snap.agents,
    activity: snap.activity,
    bannedAddresses: snap.bannedAddresses,
  };
}

function readStored(): ReturnType<typeof persistable> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Private windows, cleared site data, quota — none of which should
    // stop the wallet from opening.
    return null;
  }
}

function writeStored(snap: WalletSnapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable(snap)));
  } catch {
    /* non-fatal */
  }
}

export function clearStoredWallet() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
}

/**
 * Shared snapshot loader. The server keeps working state in memory; the
 * browser keeps the last snapshot so a restart doesn't wipe your agents.
 * On a cold start we offer the stored copy back to the server, which
 * takes it only if it has nothing of its own.
 */
export function useWallet() {
  const [snap, setSnap] = useState<WalletSnapshot | null>(null);

  const load = useCallback(async (): Promise<WalletSnapshot> => {
    const res = await fetch("/api/wallet", { cache: "no-store" });
    return (await res.json()) as WalletSnapshot;
  }, []);

  const refresh = useCallback(async () => {
    const data = await load();
    writeStored(data);
    setSnap(data);
  }, [load]);

  useEffect(() => {
    let alive = true;
    (async () => {
      let data = await load();

      // Server came up empty but the browser remembers a wallet — restore it.
      if (!data.onboarding.complete && data.agents.length === 0) {
        const stored = readStored();
        if (stored?.onboarding?.complete) {
          const res = await fetch("/api/wallet/hydrate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ state: stored }),
          });
          const outcome = await res.json().catch(() => ({ hydrated: false }));
          if (outcome.hydrated) data = await load();
        }
      }

      if (!alive) return;
      writeStored(data);
      setSnap(data);
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  return { snap, refresh };
}

export function WalletLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-sm text-[var(--bind-fg-faint)]">
      Opening wallet…
    </div>
  );
}
