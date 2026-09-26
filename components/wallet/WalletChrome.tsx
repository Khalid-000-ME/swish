"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { WalletSnapshot } from "./types";
import { shortAddr } from "./types";
import { SourceBadge } from "./bits";

/** The frame every wallet page sits in: a thin top bar with who you are
 *  and what's live, and a mesh glow behind it. Deliberately quiet — the
 *  page underneath is what people came for. */
export function WalletChrome({
  snap,
  back,
  title,
  children,
}: {
  snap: WalletSnapshot;
  back?: { href: string; label: string };
  title?: string;
  children: ReactNode;
}) {
  return (
    <main className="relative min-h-dvh bg-[var(--bind-black)]">
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-72 opacity-40"
        style={{ background: "radial-gradient(70% 100% at 50% 0%, var(--bind-navy-2), transparent)" }}
      />

      <div className="relative z-10">
        <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-5 py-4">
          {back ? (
            <Link
              href={back.href}
              className="flex items-center gap-1.5 text-sm text-[var(--bind-fg-dim)] transition hover:text-[var(--bind-fg)]"
            >
              <span>←</span>
              {back.label}
            </Link>
          ) : (
            <Link href="/" className="flex items-center gap-2 text-sm font-medium text-[var(--bind-fg)]">
              <span className="dot" style={{ background: "var(--bind-accent-2)" }} />
              Bind
            </Link>
          )}

          {title && <span className="text-sm font-medium text-[var(--bind-fg)]">{title}</span>}

          <div className="flex items-center gap-2">
            {snap.operator.address && (
              <span className="chip text-[11px] text-[var(--bind-fg-dim)]">
                <span className="dot" style={{ background: "var(--bind-ok)" }} />
                {shortAddr(snap.operator.address)}
              </span>
            )}
          </div>
        </header>

        {children}

        <footer className="mx-auto flex w-full max-w-2xl flex-wrap justify-center gap-1.5 px-5 pb-8 pt-4">
          <SourceBadge live={snap.chainLive} liveLabel="Sui testnet · live" simLabel="chain simulated" />
          <SourceBadge live={!snap.worldSandbox} liveLabel="World live" simLabel="World sandbox" />
        </footer>
      </div>
    </main>
  );
}
