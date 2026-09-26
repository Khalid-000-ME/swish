"use client";

import { ConnectionsPanel } from "@/components/wallet/ConnectionsPanel";
import { useWallet, WalletLoading } from "@/components/wallet/WalletShell";
import { WalletChrome } from "@/components/wallet/WalletChrome";

export default function ConnectionsPage() {
  const { snap } = useWallet();
  if (!snap) return <WalletLoading />;

  return (
    <WalletChrome snap={snap} back={{ href: "/wallet", label: "Wallet" }}>
      <div className="mx-auto w-full max-w-2xl px-5 pb-20">
        <ConnectionsPanel snap={snap} />
      </div>
    </WalletChrome>
  );
}
