import type { Metadata } from "next";
import { Figtree, IBM_Plex_Mono, Marcellus } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${marcellus.variable} ${figtree.variable} ${plexMono.variable}`}
    >
      <body className="min-h-dvh">
        <div className="flex min-h-dvh">
          <Sidebar />
          <main className="min-w-0 flex-1">
            <div className="mx-auto max-w-6xl px-8 py-10">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
