"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { AgentPanel } from "@/components/wallet/AgentPanel";
import { useWallet, WalletLoading } from "@/components/wallet/WalletShell";
import { WalletChrome } from "@/components/wallet/WalletChrome";

export default function AgentPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = use(params);
  const { snap, refresh } = useWallet();

  if (!snap) return <WalletLoading />;
  const agent = snap.agents.find((a) => a.id === agentId);
  if (!agent) return notFound();

  return (
    <WalletChrome snap={snap} back={{ href: "/wallet", label: "Wallet" }}>
      <div className="mx-auto w-full max-w-2xl px-5 pb-20">
        <AgentPanel agent={agent} snap={snap} onChanged={refresh} />
      </div>
    </WalletChrome>
  );
}
