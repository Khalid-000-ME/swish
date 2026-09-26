import type { Metadata } from "next";
import { Instrument_Serif, Bricolage_Grotesque, Space_Mono } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

/**
 * Numbers only — balances, caps, amounts, counts.
 *
 * A wallet's numbers need to be comparable down a column and the same
 * width as they change, which a proportional face can't do. Hex strings
 * stay in the system monospace stack: they're identifiers to be scanned
 * for a prefix, not quantities to be read, and Space Mono's character
 * makes long hex harder to skim rather than easier.
 */
const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Swish — the allowance wallet for AI agents",
  description:
    "An agent can only spend what it said it would spend it on. Fund a vault, hand it to your agent, and every payment is diffed against its own declared intent before it can move.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${instrumentSerif.variable} ${spaceMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--bind-black)] text-[var(--bind-fg)] font-sans">
        {children}
      </body>
    </html>
  );
}
