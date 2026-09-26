"use client";

import { use } from "react";
import { ConnectApproval } from "@/components/wallet/ConnectApproval";
import { useWallet, WalletLoading } from "@/components/wallet/WalletShell";
import { WalletChrome } from "@/components/wallet/WalletChrome";

export default function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  const { request } = use(searchParams);
  const { snap, refresh } = useWallet();

  if (!snap) return <WalletLoading />;

  if (!request) {
    return (
      <WalletChrome snap={snap} back={{ href: "/wallet", label: "Wallet" }}>
        <div className="mx-auto max-w-md p-10 text-center text-sm text-[var(--swish-fg-dim)]">
          No connection request specified.
        </div>
      </WalletChrome>
    );
  }

  return (
    <WalletChrome snap={snap} back={{ href: "/wallet", label: "Wallet" }}>
      <ConnectApproval requestId={request} snap={snap} onChanged={refresh} />
    </WalletChrome>
  );
}
