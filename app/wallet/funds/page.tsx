"use client";

import { FundsPanel } from "@/components/wallet/FundsPanel";
import { useWallet, WalletLoading } from "@/components/wallet/WalletShell";
import { WalletChrome } from "@/components/wallet/WalletChrome";

export default function FundsPage() {
  const { snap, refresh } = useWallet();
  if (!snap) return <WalletLoading />;

  return (
    <WalletChrome snap={snap} back={{ href: "/wallet", label: "Wallet" }}>
      <div className="mx-auto w-full max-w-2xl px-5 pb-20">
        <FundsPanel snap={snap} onChanged={refresh} />
      </div>
    </WalletChrome>
  );
}
