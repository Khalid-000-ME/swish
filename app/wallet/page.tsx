"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { WalletHome } from "@/components/wallet/WalletHome";
import { useWallet, WalletLoading } from "@/components/wallet/WalletShell";
import { WalletChrome } from "@/components/wallet/WalletChrome";

export default function WalletPage() {
  const { snap } = useWallet();
  const router = useRouter();

  // A wallet with nobody in it has nothing to show — send them to set up.
  useEffect(() => {
    if (snap && !snap.onboarding.complete) router.replace("/onboarding");
  }, [snap, router]);

  if (!snap) return <WalletLoading />;
  if (!snap.onboarding.complete) return <WalletLoading />;

  return (
    <WalletChrome snap={snap}>
      <WalletHome snap={snap} />
    </WalletChrome>
  );
}
