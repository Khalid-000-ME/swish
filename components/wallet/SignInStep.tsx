"use client";

import { useState } from "react";
import { ConnectModal, useCurrentAccount, useWallets, useDisconnectWallet } from "@mysten/dapp-kit";
import { ExplorerLink } from "./ExplorerLink";

/**
 * Real Sui sign-in over the wallet standard — whatever wallet the person
 * has installed (Slush, Suiet, Ethos, a zkLogin-backed wallet) shows up
 * here and connecting hands us their actual address.
 *
 * If no wallet is detected we say so and offer the manual path rather
 * than dead-ending, because a judge or a teammate opening this on a
 * fresh browser shouldn't hit a wall.
 */
export function SignInStep({
  busy,
  onSignedIn,
}: {
  busy: boolean;
  onSignedIn: (address: string) => void;
}) {
  const account = useCurrentAccount();
  const wallets = useWallets();
  const { mutate: disconnect } = useDisconnectWallet();

  const [modalOpen, setModalOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const [typed, setTyped] = useState("");

  return (
    <div>
      <h2 className="text-lg font-semibold text-[var(--bind-fg)]">Sign in with your Sui wallet</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--bind-fg-dim)]">
        This address owns every vault below it. Agents get their own addresses, but they never own
        anything — you do.
      </p>

      {account ? (
        <div className="mt-5">
          <div className="rounded-xl border border-[var(--bind-line)] bg-black/20 p-4">
            <div className="flex items-center gap-2">
              <span className="dot" style={{ background: "var(--bind-ok)" }} />
              <span className="text-sm font-medium text-[var(--bind-fg)]">Wallet connected</span>
            </div>
            <div className="mt-2">
              <ExplorerLink value={account.address} kind="address" />
            </div>
          </div>

          <button
            disabled={busy}
            onClick={() => onSignedIn(account.address)}
            className="mt-4 w-full rounded-full py-3 text-sm font-semibold text-[var(--bind-black)] transition disabled:opacity-40"
            style={{ background: "var(--bind-mist)" }}
          >
            Continue as {account.address.slice(0, 6)}…{account.address.slice(-4)}
          </button>

          <button
            disabled={busy}
            onClick={() => disconnect()}
            className="mt-2 w-full rounded-full py-2.5 text-sm text-[var(--bind-fg-faint)] transition hover:bg-white/5 disabled:opacity-40"
          >
            Use a different wallet
          </button>
        </div>
      ) : (
        <div className="mt-5">
          <ConnectModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            trigger={
              <button
                disabled={busy}
                className="w-full rounded-full py-3 text-sm font-semibold text-[var(--bind-black)] transition disabled:opacity-40"
                style={{ background: "var(--bind-mist)" }}
              >
                Connect wallet
              </button>
            }
          />

          {wallets.length === 0 && (
            <p className="mt-3 text-[11px] leading-snug text-[var(--bind-fg-faint)]">
              No Sui wallet detected in this browser. Install one (Slush, Suiet, Ethos) and reload,
              or paste an address below to continue without one.
            </p>
          )}

          {!manual ? (
            <button
              onClick={() => setManual(true)}
              className="mt-3 w-full text-[12px] text-[var(--bind-fg-faint)] underline underline-offset-2 transition hover:text-[var(--bind-fg-dim)]"
            >
              Paste an address instead
            </button>
          ) : (
            <div className="mt-4">
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
                className="w-full rounded-xl border border-[var(--bind-line-strong)] bg-black/30 px-4 py-3 font-mono text-sm text-[var(--bind-fg)] outline-none placeholder:text-[var(--bind-fg-faint)] focus:border-[var(--bind-accent-2)]"
              />
              <button
                disabled={busy || !typed.trim()}
                onClick={() => onSignedIn(typed.trim())}
                className="mt-3 w-full rounded-full border py-3 text-sm font-semibold transition disabled:opacity-40"
                style={{ borderColor: "var(--bind-line-strong)", color: "var(--bind-fg)" }}
              >
                Continue with pasted address
              </button>
              <p className="mt-2 text-[11px] text-[var(--bind-fg-faint)]">
                A pasted address can receive and be watched, but nothing here can sign on its behalf
                — connect a wallet for that.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
