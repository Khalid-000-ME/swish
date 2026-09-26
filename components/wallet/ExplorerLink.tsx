import { explorerUrl, guessKind, type ExplorerKind } from "@/lib/explorer";
import { shortAddr } from "./types";

/**
 * Any on-chain identifier the wallet prints, made clickable. Defaults to
 * an abbreviated label because full 64-character hex wrecks every layout
 * it touches.
 */
export function ExplorerLink({
  value,
  kind,
  label,
  className,
  full,
}: {
  value: string;
  kind?: ExplorerKind;
  label?: string;
  className?: string;
  full?: boolean;
}) {
  const resolved = kind ?? guessKind(value);
  return (
    <a
      href={explorerUrl(resolved, value)}
      target="_blank"
      rel="noreferrer"
      title={value}
      onClick={(e) => e.stopPropagation()}
      className={
        className ??
        "font-mono text-[12px] text-[var(--bind-fg-dim)] underline decoration-[var(--bind-line-strong)] underline-offset-2 transition hover:text-[var(--bind-accent-2)] hover:decoration-[var(--bind-accent-2)]"
      }
    >
      {label ?? (full ? value : shortAddr(value))}
    </a>
  );
}
