import type { Metadata } from "next";
import { Figtree, IBM_Plex_Mono, Marcellus } from "next/font/google";
import "./globals.css";

const marcellus = Marcellus({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-marcellus",
});

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
});

const plexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "The Wedding Ledger",
  description: "Private wedding planner",
};

/*
 * Deliberately thin: fonts, tokens and the document, nothing else.
 *
 * The planner's sidebar lives in the (app) group's layout instead, because
 * the invitation under /i/[token] is served to guests with no sign-in in
 * front of it and must never render a link into the private app. Keeping
 * the shell out of the root layout makes that structural rather than a
 * rule someone has to remember.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${marcellus.variable} ${figtree.variable} ${plexMono.variable}`}
    >
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
