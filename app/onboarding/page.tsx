"use client";

import { Onboarding } from "@/components/wallet/Onboarding";
import { useWallet, WalletLoading } from "@/components/wallet/WalletShell";

export default function OnboardingPage() {
  const { snap, refresh } = useWallet();
  if (!snap) return <WalletLoading />;

  return (
    <main className="relative min-h-dvh bg-[var(--bind-black)]">
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-72 opacity-40"
        style={{ background: "radial-gradient(70% 100% at 50% 0%, var(--bind-navy-2), transparent)" }}
      />
      <div className="relative z-10">
        {/* No wallet providers here on purpose: Swish mints its own keys
            during onboarding, so the wizard has no reason to go looking
            for other wallets installed in the browser. */}
        <Onboarding snap={snap} onChanged={refresh} />
      </div>
    </main>
  );
}
