import type { Metadata } from "next";
import { EB_Garamond } from "next/font/google";
import { requestOrigin } from "@/lib/request-origin";
import { Reveal } from "./reveal";

/** Loaded here and nowhere else: the planner never sets an ampersand. */
const ebGaramond = EB_Garamond({
  weight: "400",
  style: "italic",
  subsets: ["latin"],
  variable: "--font-eb-garamond",
});

export async function generateMetadata(): Promise<Metadata> {
  return {
    /*
     * Nothing under here is indexed. A link to a wedding gets forwarded,
     * pasted into group chats and previewed by every messaging app on the
     * way, and none of those previews - or search results - should carry
     * the couple's names, the date or the address.
     */
    robots: { index: false, follow: false, nocache: true },
    /*
     * What those previews do carry: a picture of the stationery
     * (`opengraph-image.tsx`, generated from the artwork and nothing
     * else) and the site's own one-line description of itself. A
     * messaging app needs the image's absolute URL, and the app only
     * knows its own domain from the request it is answering - so the
     * base is read off the request, the same way the passkeys learn
     * which domain they belong to. Without it Next would print
     * localhost, and every preview would be blank.
     */
    metadataBase: new URL(await requestOrigin()),
    description: "An invitation, the plan for the day, and somewhere to reply.",
  };
}

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
        <style>{
          /*
           * Take the curtain away, and release what it was covering -
           * the invitation is held at zero opacity for the script that
           * is going to animate it up, and without one it would stay
           * there.
           */
          `.envelope-stage{display:none!important}` +
          `main[data-envelope="pending"]{opacity:1!important}` +
          /*
           * The flourishes are held at their opening state for a script
           * that is never going to run here, so release those too.
           */
          `[data-reveal]{opacity:var(--sketch-opacity,1)!important;` +
          `transform:translateX(var(--sketch-x,0))!important}`
        }</style>
      </noscript>
      {children}
      <Reveal />
    </div>
  );
}
