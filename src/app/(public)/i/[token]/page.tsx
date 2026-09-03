import { CalendarPlus, Camera, MapPin } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { daysUntilNZ, formatDateFull, formatDateLong } from "@/lib/dates";
import {
  getFaq,
  getGuestSchedule,
  getInvitation,
  getSiteContent,
} from "@/lib/public/queries";
import { formatTime, formatTimeRange } from "@/lib/run-sheet";
import { Envelope } from "./envelope";
import { RsvpCard } from "./rsvp-card";
import { sealCookieName } from "./seal-cookie";
import { FloralCorner, Ornament, Panel, Prose, Section, Sketch } from "../../sections";
import { StickyRsvp } from "./sticky-rsvp";

/*
 * The invitation. Served to anyone holding the link and to nobody else -
 * there is no session, no account, and no way in from here to the
 * planner. Every read goes through @/lib/public, which is the only place
 * that decides what a guest is allowed to know.
 */
export const dynamic = "force-dynamic";

export default async function InvitationPage({
  params,
}: PageProps<"/i/[token]">) {
  const { token } = await params;
  const [invitation, site] = await Promise.all([
    getInvitation(token),
    getSiteContent(),
  ]);
  // Unknown token, or a site nobody has published yet. Identical response
  // either way: whether a token exists is not something to leak.
  if (!invitation || !site) notFound();

  const [schedule, faq, jar] = await Promise.all([
    getGuestSchedule(),
    getFaq(),
    cookies(),
  ]);
  // Opened before on this browser: the envelope never enters the HTML,
  // so there is nothing to flash up and dismiss.
  const alreadyOpened = jar.get(sealCookieName(token))?.value === "1";

  const initialA = (site.partnerAName[0] ?? "A").toUpperCase();
  const initialB = (site.partnerBName[0] ?? "B").toUpperCase();
  const daysAway = site.weddingDate ? daysUntilNZ(site.weddingDate) : null;

  return (
    <>
      {!alreadyOpened && (
        <Envelope
          token={token}
          addressee={invitation.householdName}
          address={invitation.address}
          initialA={initialA}
          initialB={initialB}
        />
      )}

      {/*
        * Held back while the envelope is over it, and only then. The
        * flag comes off the same cookie the envelope itself does, so a
        * returning guest gets the page with no opacity on it at all
        * rather than one that has to be released by a script.
        */}
      <main id="main" data-envelope={alreadyOpened ? undefined : "pending"}>
        {/* ---------------------------------------------------------- *
         * The card itself.
         * ---------------------------------------------------------- */}
        {/*
          * The card. One washed sheet with painted corners, spanning the
          * whole viewport rather than the text column - the wash belongs
          * to the paper, and paper does not stop at 42rem.
          *
          * `isolate` so the -z-10 on the corners is measured against this
          * header and not the page, which would put them behind the
          * paper and out of sight; `overflow-hidden` is what crops each
          * cluster to the two edges it bleeds off.
          */}
        <header className="relative isolate flex min-h-[92dvh] w-full flex-col items-center justify-center overflow-hidden pt-16 pb-[min(calc(40vw+1.5rem),19rem)] text-center">
          <div className="wash grain absolute inset-0 -z-10" aria-hidden />
          {/* The type is centred in what is left above these, not in the
              header - which is why the padding below is so lopsided. A
              painted corner the names sit on top of is a busy card, and
              the whole point of this layout is the clear middle.
              The padding tracks the corner rather than the viewport:
              these are sized as a fraction of the width, so 40vw is the
              taller one's own height, and a vh-based gap would leave a
              hole on a phone and still crowd on a laptop. */}
          {/* One dove, high and faint, opposite the painted corners -
              the hero is bottom-heavy without something up here. */}
          <Sketch
            name="dove-rising"
            arrive="now-wing"
            className="top-[6%] right-[2%] w-[17vw] max-w-[6.5rem] [--sketch-opacity:0.3] sm:right-[7%]"
          />
          <FloralCorner at="bottom-left" className="w-[64%] max-w-[27rem]" />
          <FloralCorner at="bottom-right" className="w-[38%] max-w-[16rem]" />
          {/* The card dissolving into the page. Without it the wash and
              the painted corners both stop dead on the header's bottom
              edge, and a cluster sliced off mid-leaf reads as a mistake
              rather than as bleed. Last of the three so it paints over
              them: they share a z-index, so DOM order decides. */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[16%] bg-gradient-to-b from-transparent to-paper"
            aria-hidden
          />

          <div className="mx-auto w-full max-w-2xl px-6">
          <p className="eyebrow text-brass">
            Together with their families
          </p>

          <h1
            id="invitation-title"
            tabIndex={-1}
            // tabIndex so the envelope can hand focus here on dismissal.
            // No outline-none: a keyboard user who reaches it should still
            // get the ring, and programmatic focus does not draw one.
            className="engraved deboss mt-8 text-[clamp(2.75rem,15vw,6.5rem)] text-ink"
            // The animation runs once on load and is the only motion on
            // the page after the seal; reduced motion collapses it.
            style={{ animation: "settle 900ms cubic-bezier(0.22,1,0.36,1) both" }}
          >
            <span className="block">{site.partnerAName}</span>
            <span className="ampersand my-1 block text-[0.62em] leading-none">
              &amp;
            </span>
            <span className="block">{site.partnerBName}</span>
          </h1>

          <Ornament className="mt-10" />

          <p className="mt-8 font-display text-lg text-ink-soft sm:text-xl">
            are to be married
          </p>

          {site.weddingDate && (
            <p className="mt-3 font-display text-[clamp(1.15rem,4.6vw,1.6rem)] text-ink">
              {formatDateFull(site.weddingDate)}
              {site.ceremonyTime && (
                <span className="text-ink-soft">
                  {" · "}
                  {formatTime(site.ceremonyTime)}
                </span>
              )}
            </p>
          )}

          {site.venueName && (
            <p className="mt-2 text-sm text-ink-soft sm:text-base">
              {site.venueName}
              {site.venueAddress && (
                <span className="block text-ink-faint">{site.venueAddress}</span>
              )}
            </p>
          )}

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={`/i/${token}#rsvp`}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-ink px-6 text-sm font-medium text-paper transition-colors hover:bg-spine-raised"
            >
              Reply to your invitation
            </Link>
            {site.weddingDate && (
              <a
                href={`/i/${token}/wedding.ics`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-hairline-strong bg-card px-5 text-sm text-ink transition-colors hover:border-ink-faint"
              >
                <CalendarPlus className="size-4" aria-hidden />
                Add to calendar
              </a>
            )}
          </div>

          {/* A countdown as one line of type, not four boxes of digits. */}
          {daysAway !== null && daysAway >= 0 && (
            <p className="mt-10 text-xs text-ink-faint">
              <span className="figures">{daysAway}</span>
              {daysAway === 1 ? " day away" : " days away"}
            </p>
          )}
          </div>
        </header>

        {site.welcomeMessage && (
          <div className="mx-auto w-full max-w-xl px-6 pb-6">
            <p className="text-center font-display text-lg leading-relaxed whitespace-pre-line text-ink-soft">
              {site.welcomeMessage}
            </p>
          </div>
        )}

        {/* ---------------------------------------------------------- *
         * The day. Filtered from the one canonical run sheet.
         * ---------------------------------------------------------- */}
        {schedule.length > 0 && (
          <Section
            id="the-day"
            eyebrow="How the day runs"
            title="The day"
            motif="glasses"
            sketch={{ name: "candelabra", side: "left" }}
          >
            <ol className="space-y-0">
              {schedule.map((moment) => (
                <li
                  key={moment.id}
                  className="grid grid-cols-1 gap-1 border-t border-hairline py-5 sm:grid-cols-[8.5rem_1fr] sm:gap-6"
                >
                  <p className="figures text-sm text-brass">
                    {formatTimeRange(moment.startTime, moment.endTime)}
                  </p>
                  <div>
                    <p className="font-display text-lg text-ink">
                      {moment.title}
                    </p>
                    {moment.location && (
                      <p className="mt-0.5 text-sm text-ink-faint">
                        {moment.location}
                      </p>
                    )}
                    {moment.detail && (
                      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                        {moment.detail}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {/* ---------------------------------------------------------- *
         * Getting there and staying: the two practical questions.
         * ---------------------------------------------------------- */}
        {(site.travelNotes || site.accommodationNotes || site.venueMapUrl) && (
          <Section
            id="getting-there"
            eyebrow="Before you set off"
            title="Getting there and staying"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(site.travelNotes || site.venueMapUrl) && (
                <Panel>
                  <p className="eyebrow text-ink-faint">Getting there</p>
                  {site.venueAddress && (
                    <p className="mt-3 font-display text-base text-ink">
                      {site.venueAddress}
                    </p>
                  )}
                  {site.travelNotes && (
                    <div className="mt-3">
                      <Prose>{site.travelNotes}</Prose>
                    </div>
                  )}
                  {site.venueMapUrl && (
                    <a
                      href={site.venueMapUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm text-brass underline decoration-brass/40 underline-offset-4 hover:decoration-brass"
                    >
                      <MapPin className="size-4" aria-hidden />
                      Open in maps
                    </a>
                  )}
                </Panel>
              )}
              {site.accommodationNotes && (
                <Panel>
                  <p className="eyebrow text-ink-faint">Staying the night</p>
                  <div className="mt-3">
                    <Prose>{site.accommodationNotes}</Prose>
                  </div>
                </Panel>
              )}
            </div>
          </Section>
        )}

        {/* ---------------------------------------------------------- *
         * Dress code and the questions that otherwise arrive by text.
         * ---------------------------------------------------------- */}
        {(site.dressCode || faq.length > 0) && (
          <Section
            id="details"
            eyebrow="Everything else"
            title="Good to know"
            sketch={{ name: "ribbon", side: "left", className: "w-[26vw] max-w-[10rem]" }}
          >
            {site.dressCode && (
              <div className="mb-8 text-center">
                <p className="eyebrow text-ink-faint">What to wear</p>
                <p className="mt-3 font-display text-xl text-ink">
                  {site.dressCode}
                </p>
              </div>
            )}

            {faq.length > 0 && (
              <div className="border-t border-hairline">
                {faq.map((entry) => (
                  <details
                    key={entry.id}
                    className="group border-b border-hairline"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left font-display text-base text-ink marker:hidden">
                      {entry.question}
                      <span
                        aria-hidden
                        className="shrink-0 text-brass transition-transform duration-200 group-open:rotate-45"
                      >
                        +
                      </span>
                    </summary>
                    <div className="pb-5">
                      <Prose>{entry.answer}</Prose>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </Section>
        )}

        {site.giftNote && (
          <Section id="gifts" eyebrow="You have asked" title="Gifts" motif="gift">
            <Panel className="text-center">
              <Prose>{site.giftNote}</Prose>
            </Panel>
          </Section>
        )}

        {/* ---------------------------------------------------------- *
         * The reply.
         * ---------------------------------------------------------- */}
        <Section
          id="rsvp"
          // The weekday earns its place on the wedding date and nowhere
          // else; on a deadline it just makes the line wrap.
          eyebrow={
            site.rsvpDeadline
              ? `Please reply by ${formatDateLong(site.rsvpDeadline)}`
              : "Please reply"
          }
          title="Will you be there?"
          motif="rings"
          sketch={{
            name: "heart",
            side: "right",
            className: "w-[15vw] max-w-[5.5rem]",
          }}
        >
          <RsvpCard
            token={token}
            householdName={invitation.householdName}
            guests={invitation.guests}
            message={invitation.message}
            songRequest={invitation.songRequest}
            respondedAt={invitation.respondedAt?.toISOString() ?? null}
          />
        </Section>

        {site.photosEnabled && (
          <Section
            id="photos"
            eyebrow="Share the day"
            title="Photographs"
            motif="camera"
            sketch={{ name: "dove-turning", side: "right" }}
          >
            <Panel className="text-center">
              <p className="text-[0.95rem] leading-relaxed text-ink-soft">
                Whatever you catch on the day, we would love to see. Add your
                photographs here and they join everyone else&rsquo;s.
              </p>
              <Link
                href={`/i/${token}/photos`}
                className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-ink px-6 text-sm font-medium text-paper transition-colors hover:bg-spine-raised"
              >
                <Camera className="size-4" aria-hidden />
                Open the shared album
              </Link>
            </Panel>
          </Section>
        )}

        <footer className="mx-auto w-full max-w-2xl px-6 pt-8 pb-28 text-center sm:pb-16">
          <Ornament />
          <p className="engraved mt-8 text-lg text-ink-faint">
            {initialA}
            <span className="ampersand mx-1 text-[1.25em]">&amp;</span>
            {initialB}
          </p>
        </footer>
      </main>

      <StickyRsvp />
    </>
  );
}
