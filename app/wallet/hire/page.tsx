"use client";

import { HirePanel } from "@/components/wallet/HirePanel";
import { useWallet, WalletLoading } from "@/components/wallet/WalletShell";
import { WalletChrome } from "@/components/wallet/WalletChrome";

export default function HirePage() {
  const { snap } = useWallet();
  if (!snap) return <WalletLoading />;

  return (
    <WalletChrome snap={snap} back={{ href: "/wallet", label: "Wallet" }}>
      <div className="mx-auto w-full max-w-2xl px-5 pb-20">
        <HirePanel snap={snap} />
      </div>
    </WalletChrome>
  );
}
