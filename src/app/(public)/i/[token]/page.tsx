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
import { Ornament, Panel, Prose, Section } from "../../sections";
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

      <main id="main">
        {/* ---------------------------------------------------------- *
         * The card itself.
         * ---------------------------------------------------------- */}
        <header className="mx-auto flex min-h-[92dvh] w-full max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
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
          <Section id="the-day" eyebrow="How the day runs" title="The day">
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
          <Section id="details" eyebrow="Everything else" title="Good to know">
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
          <Section id="gifts" eyebrow="You have asked" title="Gifts">
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
          <Section id="photos" eyebrow="Share the day" title="Photographs">
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
