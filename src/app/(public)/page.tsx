import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dateInWords } from "@/lib/date-words";
import { daysUntilNZ } from "@/lib/dates";
import { getSiteContent } from "@/lib/public/queries";
import { WaxSeal } from "./i/[token]/wax-seal";
import { isVenueDrawn, Lodge } from "./lodge";
import { FloralCorner, Frame, FrameCorners, Ornament, Sketch } from "./sections";

/**
 * The front door.
 *
 * Anyone who types the domain gets this, with no password, so it says
 * the least it can: who is getting married, when, and roughly where.
 * No address, no schedule, no guest list, nothing about who was
 * invited - all of that is behind a household's own link.
 *
 * The one job it does is stop a guest who has mislaid their link from
 * being met with a 404 and assuming the whole thing has been called off.
 * It is set as a calling card: the couple's seal, their names, the date
 * in words, and a line saying where the invitation itself is.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "A wedding",
};

export default async function LandingPage() {
  const site = await getSiteContent();
  // Not published yet means nothing public exists, the front door
  // included. The kill switch is a kill switch.
  if (!site) notFound();

  const initialA = (site.partnerAName[0] ?? "A").toUpperCase();
  const initialB = (site.partnerBName[0] ?? "B").toUpperCase();
  const daysAway = site.weddingDate ? daysUntilNZ(site.weddingDate) : null;
  const words = site.weddingDate ? dateInWords(site.weddingDate) : null;
  const lodge = isVenueDrawn(site.venueName);

  return (
    <main
      id="main"
      className="relative isolate flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden px-5 py-16 text-center sm:px-6"
    >
      <div className="wash absolute inset-0 -z-10" aria-hidden />
      {/*
        * One corner, not three: this is the front door for someone who
        * has mislaid their link, and it should look like the same
        * wedding as the invitation without pretending to be it.
        */}
      <FloralCorner at="top-left" className="w-[46%] max-w-[19rem]" />
      <Sketch
        name="bow"
        arrive="now"
        className="top-[10%] right-[5%] w-[16vw] max-w-[6rem] [--sketch-opacity:0.35]"
      />

      <div className="relative isolate mx-auto w-full max-w-xl px-6 py-12 sm:px-12 sm:py-14">
        <Frame />
        <FrameCorners />

        {/* The couple's mark, at the head of the card. The same seal that
            holds every envelope shut, unbroken here. */}
        <div className="rise-now mx-auto size-24 [--rise-delay:80ms] sm:size-28">
          <WaxSeal initialA={initialA} initialB={initialB} idPrefix="door" />
        </div>

        <p className="eyebrow rise-now mt-6 text-brass [--rise-delay:200ms]">The wedding of</p>

        <h1
          className="engraved deboss mt-6 text-[clamp(2.4rem,12vw,5rem)] text-ink"
          style={{ animation: "settle 900ms cubic-bezier(0.22,1,0.36,1) both" }}
        >
          <span className="block">{site.partnerAName}</span>
          <span className="ampersand my-1 block text-[0.62em] leading-none">
            &amp;
          </span>
          <span className="block">{site.partnerBName}</span>
        </h1>

        <Ornament className="mt-8" />

        {words && (
          <div className="rise-now mt-7 [--rise-delay:420ms]">
            <p className="font-display text-[clamp(1.15rem,4.2vw,1.5rem)] leading-tight text-ink">
              {words.weekday}, {words.day}
            </p>
            <p className="mt-1 font-display text-[clamp(1rem,3.4vw,1.2rem)] text-ink-soft">
              {words.year}
            </p>
          </div>
        )}

        {/*
         * The house, drawn, over the name of the town. A line drawing of
         * a building on a hill names nothing a stranger could use, and it
         * is what makes this a card for *this* wedding rather than a
         * card. Nothing about the venue is written here that was not
         * written before.
         */}
        {lodge && (
          <div className="rise-now mt-7 [--rise-delay:480ms]">
            <Lodge
              idPrefix="door"
              className="mx-auto w-[min(100%,17rem)] text-brass sm:w-[20rem]"
            />
          </div>
        )}

        {/*
         * The town, not the address. Guests who are coming have the full
         * details on their own invitation; everyone else has no business
         * with them.
         */}
        {site.venueAddress && (
          <p
            className={`eyebrow rise-now text-ink-soft [--rise-delay:560ms] ${lodge ? "mt-3" : "mt-5"}`}
          >
            {townFrom(site.venueAddress)}
          </p>
        )}

        {daysAway !== null && daysAway >= 0 && (
          <p className="rise-now mt-7 text-ink-faint [--rise-delay:680ms]">
            <span className="font-display text-[1.5rem] text-ink">{daysAway}</span>
            <span className="eyebrow ml-2">
              {daysAway === 1 ? "day to go" : "days to go"}
            </span>
          </p>
        )}
      </div>

      <div className="rise-now mx-auto mt-10 w-full max-w-md [--rise-delay:840ms]">
        <p className="formula text-[1.2rem] leading-relaxed text-ink-soft sm:text-[1.3rem]">
          If you are joining us, we sent you a link of your own. Open that
          and you will find your invitation, the plan for the day, and
          somewhere to reply.
        </p>
        {/* The couple's own voice throughout, as on the invitation -
            naming themselves in the third person here would read as
            though somebody else had written the page. */}
        <p className="mt-4 text-xs text-ink-faint">
          Cannot find it? Ask either of us and we will send it again.
        </p>
      </div>

      {/*
       * The couple's way in. The link is only a URL - /admin is not on
       * the proxy's public allowlist, so following it still meets the
       * password. Nothing here is a security boundary; the boundary is
       * in front of the page it points at.
       */}
      <Link
        href="/admin"
        className="mt-10 inline-flex min-h-11 items-center rounded-md px-3 text-xs text-ink-faint/70 transition-colors hover:text-ink-soft"
      >
        Planning
      </Link>
    </main>
  );
}

/**
 * The last comma-separated part of the address, which for
 * "482 Hamurana Road, Rotorua" is the town. Falls back to the whole
 * string only when there is no comma to split on - in which case the
 * couple have written a one-line address and it is theirs to shorten.
 */
function townFrom(address: string): string {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) ?? address;
}
