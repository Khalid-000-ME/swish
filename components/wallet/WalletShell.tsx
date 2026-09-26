"use client";

import { useCallback, useEffect, useState } from "react";
import type { WalletSnapshot } from "./types";

/** Shared snapshot loader — every wallet page uses this so they all read
 *  the same server state rather than each inventing its own. */
export function useWallet() {
  const [snap, setSnap] = useState<WalletSnapshot | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/wallet", { cache: "no-store" });
    setSnap((await res.json()) as WalletSnapshot);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch("/api/wallet", { cache: "no-store" });
      const data = (await res.json()) as WalletSnapshot;
      if (alive) setSnap(data);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { snap, refresh };
}

export function WalletLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-sm text-[var(--bind-fg-faint)]">
      Opening wallet…
    </div>
  );
}
