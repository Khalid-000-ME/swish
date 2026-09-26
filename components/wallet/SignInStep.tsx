"use client";

import { useState } from "react";
import { ExplorerLink } from "./ExplorerLink";

/**
 * Creating the operator's keys, rather than borrowing someone else's.
 *
 * This used to open a Slush/Suiet connect modal, which was backwards:
 * Swish *is* a wallet, so asking people to bring one made it a front-end
 * for something they already had — and the address it got never signed
 * anything here anyway. Now the wallet mints an Ed25519 keypair, keeps a
 * sealed copy the way it keeps agent keys, and shows the secret once.
 *
 * Pasting an address is still offered, because watching an address you
 * hold elsewhere is a real thing to want. It's labelled as watch-only,
 * since nothing here can sign for it.
 */
export function SignInStep({
  busy,
  onGenerate,
  onPasted,
}: {
  busy: boolean;
  /** Resolves with the one-time secret, or null if generation failed. */
  onGenerate: () => Promise<{ address: string; secretKey: string } | null>;
  onPasted: (address: string) => void;
}) {
  const [created, setCreated] = useState<{ address: string; secretKey: string } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [savedIt, setSavedIt] = useState(false);
  const [manual, setManual] = useState(false);
  const [typed, setTyped] = useState("");
  const [copied, setCopied] = useState(false);

  async function generate() {
    const result = await onGenerate();
    if (result) setCreated(result);
  }

  if (created) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-[var(--bind-fg)]">Your keys</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--bind-fg-dim)]">
          This address owns every vault below it. Agents get their own addresses, but they never own
          anything — you do.
        </p>

        <div className="mt-5 rounded-xl border border-[var(--bind-line)] bg-black/20 p-4">
          <div className="text-[11px] uppercase tracking-wider text-[var(--bind-fg-faint)]">
            Public address
          </div>
          <div className="mt-1.5">
            <ExplorerLink value={created.address} kind="address" />
          </div>
        </div>

        <div
          className="mt-3 rounded-xl border p-4"
          style={{ borderColor: "var(--bind-warn)", background: "var(--bind-warn-dim)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--bind-warn)" }}>
              Secret key · shown once
            </div>
            <button
              onClick={() => setRevealed((r) => !r)}
              className="text-[11px] text-[var(--bind-fg-dim)] underline underline-offset-2 transition hover:text-[var(--bind-fg)]"
            >
              {revealed ? "Hide" : "Reveal"}
            </button>
          </div>

          <div className="mt-2 break-all rounded-lg bg-black/40 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-[var(--bind-fg)]">
            {revealed ? created.secretKey : "•".repeat(created.secretKey.length)}
          </div>

          <button
            onClick={() => {
              navigator.clipboard?.writeText(created.secretKey);
              setCopied(true);
            }}
            className="mt-2 text-[11px] text-[var(--bind-fg-dim)] underline underline-offset-2 transition hover:text-[var(--bind-fg)]"
          >
            {copied ? "Copied" : "Copy secret key"}
          </button>

          <p className="mt-2.5 text-[11px] leading-relaxed text-[var(--bind-fg-dim)]">
            Write this down somewhere only you can reach. The wallet keeps its own encrypted copy so
            it can sign, but this screen is the only place the plaintext exists — reload and it&apos;s
            gone. Anyone who has it can move your money.
          </p>
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={savedIt}
            onChange={(e) => setSavedIt(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 flex-none accent-[var(--bind-accent-2)]"
          />
          <span className="text-[12px] leading-snug text-[var(--bind-fg-dim)]">
            I&apos;ve saved my secret key somewhere safe.
          </span>
        </label>

        <button
          disabled={busy || !savedIt}
          onClick={() => onPasted(created.address)}
          className="mt-4 w-full rounded-full py-3 text-sm font-semibold text-[var(--bind-black)] transition disabled:opacity-40"
          style={{ background: "var(--bind-mist)" }}
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-[var(--bind-fg)]">Create your wallet</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--bind-fg-dim)]">
        Swish is the wallet, so it makes your keys here — you don&apos;t need another one. The address
        it creates owns every vault below it. Agents get their own addresses, but they never own
        anything.
      </p>

      <button
        disabled={busy}
        onClick={generate}
        className="mt-5 w-full rounded-full py-3 text-sm font-semibold text-[var(--bind-black)] transition disabled:opacity-40"
        style={{ background: "var(--bind-mist)" }}
      >
        {busy ? "Creating…" : "Create my keys"}
      </button>

      {!manual ? (
        <button
          onClick={() => setManual(true)}
          className="mt-3 w-full text-[12px] text-[var(--bind-fg-faint)] underline underline-offset-2 transition hover:text-[var(--bind-fg-dim)]"
        >
          I already have an address to watch
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
            onClick={() => onPasted(typed.trim())}
            className="mt-3 w-full rounded-full border py-3 text-sm font-semibold transition disabled:opacity-40"
            style={{ borderColor: "var(--bind-line-strong)", color: "var(--bind-fg)" }}
          >
            Continue, watch-only
          </button>
          <p className="mt-2 text-[11px] leading-snug text-[var(--bind-fg-faint)]">
            An address you paste can receive and be watched, but nothing here holds its key, so
            nothing here can spend from it.
          </p>
        </div>
      )}
    </div>
  );
}
