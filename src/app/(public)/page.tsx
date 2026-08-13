import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { daysUntilNZ, formatDateFull } from "@/lib/dates";
import { getSiteContent } from "@/lib/public/queries";
import { Ornament } from "./sections";

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

  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center px-6 py-16 text-center"
    >
      <p className="eyebrow text-brass">The wedding of</p>

      <h1 className="engraved deboss mt-8 text-[clamp(2.5rem,13vw,5.5rem)] text-ink">
        <span className="block">{site.partnerAName}</span>
        <span className="ampersand my-1 block text-[0.62em] leading-none">
          &amp;
        </span>
        <span className="block">{site.partnerBName}</span>
      </h1>

      <Ornament className="mt-10" />

      {site.weddingDate && (
        <p className="mt-8 font-display text-[clamp(1.1rem,4.4vw,1.5rem)] text-ink">
          {formatDateFull(site.weddingDate)}
        </p>
      )}

      {/*
       * The town, not the address. Guests who are coming have the full
       * details on their own invitation; everyone else has no business
       * with them.
       */}
      {site.venueAddress && (
        <p className="mt-1.5 text-sm text-ink-soft">
          {townFrom(site.venueAddress)}
        </p>
      )}

      {daysAway !== null && daysAway >= 0 && (
        <p className="mt-8 text-xs text-ink-faint">
          <span className="figures">{daysAway}</span>
          {daysAway === 1 ? " day away" : " days away"}
        </p>
      )}

      <div className="mt-14 border-t border-hairline pt-8">
        <p className="text-[0.95rem] leading-relaxed text-ink-soft">
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

      <p className="engraved mt-16 text-base text-ink-faint">
        {initialA}
        <span className="ampersand mx-1 text-[1.25em]">&amp;</span>
        {initialB}
      </p>

      {/*
       * The couple's way in. The link is only a URL - /admin is not on
       * the proxy's public allowlist, so following it still meets the
       * password. Nothing here is a security boundary; the boundary is
       * in front of the page it points at.
       */}
      <Link
        href="/admin"
        className="mt-6 inline-flex min-h-11 items-center rounded-md px-3 text-xs text-ink-faint/70 transition-colors hover:text-ink-soft"
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
