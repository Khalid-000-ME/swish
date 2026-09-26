import { WalletApp } from "@/components/wallet/WalletApp";

export const metadata = {
  title: "Bind — agent wallet",
  description: "Manage your AI agents' money: envelopes, allow-lists, and everything the gates caught.",
};

export default function WalletPage() {
  return (
    <main className="relative min-h-dvh bg-[var(--bind-black)]">
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-72 opacity-40"
        style={{ background: "radial-gradient(70% 100% at 50% 0%, var(--bind-navy-2), transparent)" }}
      />
      <div className="relative z-10">
        <WalletApp />
      </div>
    </main>
  );
}
