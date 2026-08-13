import type { Metadata } from "next";
import { EB_Garamond } from "next/font/google";

/** Loaded here and nowhere else: the planner never sets an ampersand. */
const ebGaramond = EB_Garamond({
  weight: "400",
  style: "italic",
  subsets: ["latin"],
  variable: "--font-eb-garamond",
});

export const metadata: Metadata = {
  /*
   * Nothing under here is indexed. A link to a wedding gets forwarded,
   * pasted into group chats and previewed by every messaging app on the
   * way, and none of those previews - or search results - should carry
   * the couple's names, the date or the address.
   */
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Everything a stranger can load lives under this one folder.
 *
 * That is not a filing preference: `no-private-imports.test.ts` reads
 * this directory and fails the build if anything in it imports the
 * database or the planner's query layer. Keeping the public surface in
 * one place is what makes that check meaningful - a public page added
 * somewhere else would slip past it.
 */
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <div className={`${ebGaramond.variable} grain relative min-h-dvh bg-paper`}>
      <noscript>
        {/*
         * The invitation is server-rendered underneath the envelope, so
         * with no JavaScript there is nothing to do but take the curtain
         * away. Nothing here is behind a gesture that only works when a
         * script does.
         */}
        <style>{`.envelope-stage{display:none!important}`}</style>
      </noscript>
      {children}
    </div>
  );
}
