import { CalendarPlus, Camera, MapPin } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { daysUntilNZ, formatDateFull, formatDateLong } from "@/lib/dates";
import {
  getFaq,
  getGallery,
  getGuestSchedule,
  getInvitation,
  getSiteContent,
} from "@/lib/public/queries";
import { formatTime, formatTimeRange } from "@/lib/run-sheet";
import { Envelope } from "./envelope";
import { RsvpCard } from "./rsvp-card";
import { sealCookieName } from "./seal-cookie";
import { isCocktail, Wardrobe } from "../../attire";
import { isVenueDrawn, Lodge } from "../../lodge";
import { Motif, type MotifName } from "../../motifs";
import { Ribbon, type RibbonLink } from "../../ribbon";
import {
  DaysToGo,
  FloralCorner,
  Frame,
  FrameCorners,
  Leaf,
  Ornament,
  Prose,
  Rise,
  Section,
  Sketch,
  Spread,
} from "../../sections";
import { StickyRsvp } from "./sticky-rsvp";

/*
 * The invitation. Served to anyone holding the link and to nobody else -
 * there is no session, no account, and no way in from here to the
 * planner. Every read goes through @/lib/public, which is the only place
 * that decides what a guest is allowed to know.
 *
 * It is laid out as one card, read top to bottom, in the order a guest
 * needs things: who and when, then a word from the couple, then the four
 * facts at a glance, then the day in full, the way there, the questions,
 * the reply, and the album. The ribbon that follows the reader is what
 * makes one long page work as a reference as well as an invitation.
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

  const [schedule, faq, gallery, jar] = await Promise.all([
    getGuestSchedule(),
    getFaq(),
    site.photosEnabled ? getGallery() : Promise.resolve([]),
    cookies(),
  ]);
  // Opened before on this browser: the envelope never enters the HTML,
  // so there is nothing to flash up and dismiss.
  const alreadyOpened = jar.get(sealCookieName(token))?.value === "1";

  const initialA = (site.partnerAName[0] ?? "A").toUpperCase();
  const initialB = (site.partnerBName[0] ?? "B").toUpperCase();
  const daysAway = site.weddingDate ? daysUntilNZ(site.weddingDate) : null;
  const town = site.venueAddress ? townFrom(site.venueAddress) : null;
  const lodge = isVenueDrawn(site.venueName);

  const hasTravel = Boolean(site.travelNotes || site.accommodationNotes || site.venueMapUrl);
  const hasDetails = Boolean(site.dressCode || faq.length > 0);

  // The ribbon's links, in page order, for the sections that exist.
  const links: RibbonLink[] = [
    schedule.length > 0 && { id: "the-day", label: "The day" },
    hasTravel && { id: "getting-there", label: "Getting there" },
    hasDetails && { id: "details", label: "Good to know" },
    site.giftNote && { id: "gifts", label: "Gifts" },
    { id: "rsvp", label: "Reply" },
    site.photosEnabled && { id: "photos", label: "Album" },
  ].filter((link): link is RibbonLink => Boolean(link));

  const keyMoment =
    schedule.find((moment) => /ceremony/i.test(moment.title))?.id ??
    schedule[0]?.id;

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

      <Ribbon
        monogram={{ a: initialA, b: initialB }}
        links={links}
        cta={{ href: "#rsvp", label: "Reply" }}
        showAfter="face"
      />

      {/*
        * Held back while the envelope is over it, and only then. The
        * flag comes off the same cookie the envelope itself does, so a
        * returning guest gets the page with no opacity on it at all
        * rather than one that has to be released by a script.
        */}
      {/*
        * `overflow-x-clip`: the marginalia hang past the column on
        * purpose, and past the viewport on a phone. Left unclipped they
        * widen the layout viewport itself, which gives the page a
        * sideways scroll and pins the ribbon to an edge off the screen.
        * `clip` rather than `hidden`, so this is not a scroll container
        * and anchors, sticky and scroll-margin all still work.
        */}
      <main
        id="main"
        data-invitation=""
        data-envelope={alreadyOpened ? undefined : "pending"}
        className="overflow-x-clip"
      >
        {/* ---------------------------------------------------------- *
         * The face of the card.
         * ---------------------------------------------------------- */}
        {/*
          * One washed sheet with painted corners, spanning the whole
          * viewport rather than the text column - the wash belongs to
          * the paper, and paper does not stop at 48rem.
          *
          * `isolate` so the -z-10 on the corners is measured against
          * this header and not the page; `overflow-hidden` crops each
          * cluster to the two edges it bleeds off.
          */}
        <header
          id="face"
          className="relative isolate flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden pt-14 pb-[min(calc(34vw+2rem),17rem)] text-center"
        >
          {/* No grain of its own: the public layout's grain sits over the
              whole sheet, this face included. A second one here would
              double the texture and stop dead at the header's edge. */}
          <div className="wash absolute inset-0 -z-10" aria-hidden />
          {/* The type is centred in what is left above the painted
              corners, not in the header - hence the lopsided padding.
              It tracks the corner rather than the viewport, because the
              corners are sized as a fraction of the width. */}
          <Sketch
            name="dove-rising"
            arrive="now-wing"
            className="top-[5%] right-[2%] w-[17vw] max-w-[6.5rem] [--sketch-opacity:0.3] sm:right-[6%]"
          />
          <FloralCorner at="bottom-left" className="w-[64%] max-w-[27rem]" />
          <FloralCorner at="bottom-right" className="w-[38%] max-w-[16rem]" />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[24%] bg-gradient-to-b from-transparent to-paper"
            aria-hidden
          />

          <div className="mx-auto w-full max-w-3xl px-5 sm:px-6">
            {/* Addressed. The envelope carried the name; the card does
                too, so a guest who skipped the ceremony still knows this
                one is theirs. */}
            <div className="rise-now [--rise-delay:120ms]">
              <p className="eyebrow text-ink-faint">An invitation for</p>
              <p className="deboss mt-2 font-display text-[clamp(1.2rem,4.4vw,1.55rem)] text-ink">
                {invitation.householdName}
              </p>
            </div>

            {/* The plate. A double rule, drawn on around the names, with
                the whole formula of an engraved card inside it. */}
            <div className="relative isolate mt-8 px-5 py-9 sm:mt-10 sm:px-12 sm:py-12">
              <Frame />
              <FrameCorners />

              <p className="eyebrow rise-now text-brass [--rise-delay:260ms]">
                Together with their families
              </p>

              <h1
                id="invitation-title"
                tabIndex={-1}
                // tabIndex so the envelope can hand focus here on
                // dismissal. No outline-none: a keyboard user who
                // reaches it should still get the ring, and programmatic
                // focus does not draw one.
                className="engraved deboss mt-6 text-[clamp(2.6rem,13.5vw,6.25rem)] text-ink"
                // Runs once on load; reduced motion collapses it.
                style={{ animation: "settle 900ms cubic-bezier(0.22,1,0.36,1) both" }}
              >
                <span className="block">{site.partnerAName}</span>
                <span className="ampersand my-1 block text-[0.62em] leading-none">
                  &amp;
                </span>
                <span className="block">{site.partnerBName}</span>
              </h1>

              <p className="formula rise-now mx-auto mt-6 max-w-md text-[clamp(1rem,4vw,1.45rem)] leading-snug text-ink-soft [--rise-delay:420ms]">
                request the pleasure of your company
                <span className="block">at the celebration of their marriage</span>
              </p>

              <Ornament className="mt-7" />

              {site.weddingDate && (
                <div className="rise-now mt-7 [--rise-delay:560ms]">
                  <p className="font-display text-[clamp(1.2rem,4.2vw,1.7rem)] leading-tight text-ink">
                    {formatDateFull(site.weddingDate)}
                  </p>
                  {site.ceremonyTime && (
                    <p className="formula mt-3 text-[clamp(1.1rem,3.6vw,1.4rem)] text-ink-soft">
                      at {formatTime(site.ceremonyTime)}
                    </p>
                  )}
                </div>
              )}

              {/* The venue, engraved above its name - the vignette a
                  letterhead carries. Only when the settings say it is
                  that house; see lodge.tsx. */}
              {lodge && (
                <div className="rise-now mt-8 [--rise-delay:640ms]">
                  <Lodge
                    idPrefix="card"
                    className="mx-auto w-[min(100%,19rem)] text-brass sm:w-[23rem]"
                  />
                </div>
              )}

              {site.venueName && (
                <p
                  className={`eyebrow rise-now text-ink-soft [--rise-delay:760ms] ${lodge ? "mt-4" : "mt-7"}`}
                >
                  {site.venueName}
                  {town && (
                    <>
                      <span className="mx-2 text-brass-bright" aria-hidden>
                        ·
                      </span>
                      {town}
                    </>
                  )}
                </p>
              )}
            </div>

            <div className="rise-now mt-9 flex flex-wrap items-center justify-center gap-3 [--rise-delay:880ms]">
              <a
                href="#rsvp"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-8 text-[0.8125rem] font-semibold tracking-caps text-paper uppercase transition-colors hover:bg-spine-raised"
              >
                Reply to your invitation
              </a>
              {site.weddingDate && (
                <a
                  href={`/i/${token}/wedding.ics`}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-hairline-strong px-6 text-[0.8125rem] font-semibold tracking-caps text-ink uppercase transition-colors hover:border-ink-faint hover:bg-card"
                >
                  <CalendarPlus className="size-4" aria-hidden />
                  Add to calendar
                </a>
              )}
            </div>

            {daysAway !== null && <DaysToGo days={daysAway} delay={1000} className="mt-9" />}
          </div>
        </header>

        {/* ---------------------------------------------------------- *
         * A word from the couple, as a letter to this household.
         * ---------------------------------------------------------- */}
        {site.welcomeMessage && (
          <Rise className="mx-auto w-full max-w-2xl px-6 pt-4 pb-10 text-center sm:pt-8">
            <p className="formula text-[1.6rem] text-ink sm:text-[1.8rem]">
              Dear {invitation.householdName},
            </p>
            <p className="formula mt-5 text-[1.3rem] leading-relaxed whitespace-pre-line text-ink-soft sm:text-[1.45rem]">
              {site.welcomeMessage}
            </p>
            <p className="engraved mt-8 text-[0.8rem] text-ink-faint">
              {site.partnerAName}
              <span className="ampersand mx-1.5 text-[1.3em]">&amp;</span>
              {site.partnerBName}
            </p>
          </Rise>
        )}

        {/* ---------------------------------------------------------- *
         * At a glance: the four facts a guest comes back for.
         * ---------------------------------------------------------- */}
        <Rise className="mx-auto w-full max-w-5xl px-6 py-10">
          <dl className="grid grid-cols-2 gap-y-8 border-y border-hairline py-8 sm:grid-cols-4 sm:gap-y-0 sm:py-0 sm:divide-x sm:divide-hairline">
            {site.weddingDate && (
              <Fact
                motif="clock"
                label="When"
                value={formatDateFull(site.weddingDate)}
                note={
                  site.ceremonyTime
                    ? site.arrivalTime
                      ? `Ceremony at ${formatTime(site.ceremonyTime)}, arrive from ${formatTime(site.arrivalTime)}`
                      : `Ceremony at ${formatTime(site.ceremonyTime)}`
                    : undefined
                }
                href={schedule.length > 0 ? "#the-day" : undefined}
              />
            )}
            {site.venueName && (
              <Fact
                motif="pin"
                label="Where"
                value={site.venueName}
                note={town ?? undefined}
                href={hasTravel ? "#getting-there" : site.venueMapUrl ?? undefined}
              />
            )}
            {site.dressCode && (
              <Fact
                motif="hanger"
                label="Wear"
                value={headline(site.dressCode)}
                note={headline(site.dressCode) !== site.dressCode ? "See the details" : undefined}
                href="#details"
              />
            )}
            <Fact
              motif="quill"
              label="Reply"
              value={site.rsvpDeadline ? `By ${formatDateLong(site.rsvpDeadline)}` : "Whenever you can"}
              note={invitation.respondedAt ? "Your reply is in" : "Everyone on one card"}
              href="#rsvp"
            />
          </dl>
        </Rise>

        {/* ---------------------------------------------------------- *
         * The day. Filtered from the one canonical run sheet.
         * ---------------------------------------------------------- */}
        {schedule.length > 0 && (
          <Section
            id="the-day"
            eyebrow="How the day runs"
            title="The day"
            motif="glasses"
            intro="From the first glass on the lawn to the last song."
            sketch={{ name: "candelabra", side: "left" }}
          >
            <ol className="programme [--spine-x:0.75rem] sm:[--spine-x:11.25rem]">
              {schedule.map((moment) => (
                <Rise
                  key={moment.id}
                  as="li"
                  className="relative grid grid-cols-[1.5rem_1fr] pb-10 last:pb-0 sm:grid-cols-[10.5rem_1.5rem_1fr] sm:gap-x-4"
                >
                  <span
                    className="programme-seed"
                    data-key={moment.id === keyMoment ? "" : undefined}
                    aria-hidden
                  />
                  <p className="hidden pt-0.5 font-display text-[1rem] whitespace-nowrap text-brass sm:block sm:text-right">
                    {formatTimeRange(moment.startTime, moment.endTime)}
                  </p>
                  <span className="hidden sm:block" aria-hidden />
                  {/* Placed by column explicitly: on a phone the time
                      column above is display:none, and the content would
                      otherwise be the first grid item and land in the
                      spine's own track. */}
                  <div className="col-start-2 pl-3 sm:col-start-3 sm:pl-2">
                    <p className="font-display text-[0.95rem] text-brass sm:hidden">
                      {formatTimeRange(moment.startTime, moment.endTime)}
                    </p>
                    <p className="mt-1 font-display text-[1.3rem] leading-tight text-ink sm:mt-0">
                      {moment.title}
                    </p>
                    {moment.location && (
                      <p className="eyebrow mt-1.5 text-ink-faint">{moment.location}</p>
                    )}
                    {moment.detail && (
                      <p className="mt-2 max-w-prose text-[1rem] leading-[1.7] text-ink-soft">
                        {moment.detail}
                      </p>
                    )}
                  </div>
                </Rise>
              ))}
            </ol>
          </Section>
        )}

        {/* ---------------------------------------------------------- *
         * Getting there and staying: the two practical questions.
         * ---------------------------------------------------------- */}
        {hasTravel && (
          <Section
            id="getting-there"
            eyebrow="Before you set off"
            title="Getting there and staying"
            motif="compass"
            width="wide"
          >
            <div className="mx-auto max-w-4xl">
              <Spread>
                {(site.travelNotes || site.venueMapUrl) && (
                  <Leaf motif="pin" eyebrow="Getting there">
                    {site.venueName && (
                      <p className="font-display text-[1.3rem] leading-tight text-ink">
                        {site.venueName}
                      </p>
                    )}
                    {site.venueAddress && (
                      <p className="mt-1 text-[1rem] text-ink-soft">{site.venueAddress}</p>
                    )}
                    {site.travelNotes && (
                      <div className="mt-5">
                        <Prose>{site.travelNotes}</Prose>
                      </div>
                    )}
                    {site.venueMapUrl && (
                      <a
                        href={site.venueMapUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-brass/50 px-5 text-[0.75rem] font-semibold tracking-caps text-brass uppercase transition-colors hover:border-brass hover:bg-brass-tint"
                      >
                        <MapPin className="size-4" aria-hidden />
                        Open in maps
                      </a>
                    )}
                  </Leaf>
                )}
                {site.accommodationNotes && (
                  <Leaf motif="key" eyebrow="Staying the night">
                    <Prose>{site.accommodationNotes}</Prose>
                  </Leaf>
                )}
              </Spread>
            </div>
          </Section>
        )}

        {/* ---------------------------------------------------------- *
         * Dress code and the questions that otherwise arrive by text.
         * ---------------------------------------------------------- */}
        {hasDetails && (
          <Section
            id="details"
            eyebrow="Everything else"
            title="Good to know"
            sketch={{ name: "ribbon", side: "left", className: "w-[26vw] max-w-[10rem]" }}
          >
            {site.dressCode && (
              <Rise className="mb-12 text-center">
                <svg viewBox="0 0 24 24" className="mx-auto size-7 text-brass-bright" aria-hidden>
                  <Motif name="hanger" />
                </svg>
                <p className="eyebrow mt-3 text-ink-faint">What to wear</p>
                <p className="formula mx-auto mt-3 max-w-lg text-[1.5rem] leading-snug text-ink sm:text-[1.7rem]">
                  {site.dressCode}
                </p>
              </Rise>
            )}
            {/* The phrase, illustrated: four garments and the colours.
                Only for the dress code it draws - see `attire.tsx`. */}
            {isCocktail(site.dressCode) && (
              <div className="mb-14 sm:mb-16">
                <Wardrobe />
              </div>
            )}

            {faq.length > 0 && (
              <Rise className="border-t border-hairline">
                {faq.map((entry) => (
                  <details key={entry.id} className="group border-b border-hairline">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-6 py-5 text-left font-display text-[1.15rem] text-ink [&::-webkit-details-marker]:hidden">
                      {entry.question}
                      {/* The plus turns as it closes up into a minus: the
                          bar collapses and the whole mark makes a half
                          turn, so it reads as a latch rather than a
                          toggle. */}
                      <span
                        className="relative size-4 shrink-0 transition-transform duration-300 ease-out group-open:rotate-180"
                        aria-hidden
                      >
                        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-brass" />
                        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-brass transition-transform duration-200 group-open:scale-y-0" />
                      </span>
                    </summary>
                    <div className="faq-answer pr-10 pb-6">
                      <Prose>{entry.answer}</Prose>
                    </div>
                  </details>
                ))}
              </Rise>
            )}
          </Section>
        )}

        {site.giftNote && (
          <Section id="gifts" eyebrow="You have asked" title="Gifts" motif="gift">
            <Rise className="mx-auto max-w-xl text-center">
              <p className="formula text-[1.3rem] leading-relaxed whitespace-pre-line text-ink-soft sm:text-[1.4rem]">
                {site.giftNote}
              </p>
            </Rise>
          </Section>
        )}

        {/* ---------------------------------------------------------- *
         * The reply.
         * ---------------------------------------------------------- */}
        <Section
          id="rsvp"
          eyebrow="Please reply"
          title="Will you be there?"
          motif="rings"
          intro={
            site.rsvpDeadline
              ? `The favour of a reply is requested by ${formatDateLong(site.rsvpDeadline)}.`
              : "The favour of a reply is requested."
          }
          sketch={{
            name: "heart",
            side: "right",
            className: "w-[15vw] max-w-[5.5rem]",
          }}
        >
          <Rise className="[--rise-y:0.75rem]">
            <RsvpCard
              token={token}
              householdName={invitation.householdName}
              guests={invitation.guests}
              message={invitation.message}
              songRequests={invitation.songRequests}
              respondedAt={invitation.respondedAt?.toISOString() ?? null}
              initialA={initialA}
              initialB={initialB}
            />
          </Rise>
        </Section>

        {/* ---------------------------------------------------------- *
         * The album.
         * ---------------------------------------------------------- */}
        {site.photosEnabled && (
          <Section
            id="photos"
            eyebrow="Share the day"
            title="The album"
            motif="camera"
            intro="Whatever you catch on the day, we would love to see."
            sketch={{ name: "dove-turning", side: "right" }}
          >
            {gallery.length > 0 && (
              <div className="relative mx-auto h-56 w-full max-w-md sm:h-64" aria-hidden>
                {/* The three latest prints, put down on the table. Each is
                    a way into the album - pick one up and it straightens
                    in your hand - but out of the tab order and hidden
                    from a screen reader, which has the button below and
                    does not need three more of it. */}
                {gallery.slice(0, 3).map((photo, index) => {
                  const place = [
                    { left: "34%", angle: "-9deg", z: "z-0" },
                    { left: "50%", angle: "3deg", z: "z-10" },
                    { left: "66%", angle: "10deg", z: "z-20" },
                  ][index];
                  return (
                    <Link
                      key={photo.id}
                      href={`/i/${token}/photos`}
                      tabIndex={-1}
                      data-reveal=""
                      className={`fan fan-in absolute top-2 ${place.z} w-36 bg-card p-1.5 shadow-overlay sm:w-44`}
                      style={{ left: place.left, "--fan-rest": place.angle } as React.CSSProperties}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/i/photo/${photo.id}/thumb`}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="aspect-[4/5] w-full object-cover"
                      />
                    </Link>
                  );
                })}
              </div>
            )}
            <Rise className="text-center">
              {gallery.length > 0 && (
                <p className="text-sm text-ink-faint">
                  <span className="font-display text-base text-ink">{gallery.length}</span>
                  {gallery.length === 1 ? " photograph" : " photographs"} so far
                </p>
              )}
              <Link
                href={`/i/${token}/photos`}
                className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-8 text-[0.8125rem] font-semibold tracking-caps text-paper uppercase transition-colors hover:bg-spine-raised"
              >
                <Camera className="size-4" aria-hidden />
                {gallery.length > 0 ? "Open the album" : "Add the first photograph"}
              </Link>
            </Rise>
          </Section>
        )}

        <footer className="mx-auto w-full max-w-2xl px-6 pt-10 pb-28 text-center sm:pb-20">
          <Ornament />
          <p className="formula mt-8 text-[1.2rem] text-ink-soft">With all our love,</p>
          <p className="engraved mt-3 text-lg text-ink">
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

/**
 * One of the four facts at a glance. A link when there is somewhere on
 * the page to go for more; otherwise just the fact.
 */
function Fact({
  motif,
  label,
  value,
  note,
  href,
}: {
  motif: MotifName;
  label: string;
  value: string;
  note?: string;
  href?: string;
}) {
  const body = (
    <>
      <svg viewBox="0 0 24 24" className="mx-auto size-6 text-brass-bright" aria-hidden>
        <Motif name={motif} />
      </svg>
      <dt className="eyebrow mt-3 text-brass">{label}</dt>
      <dd className="mt-2">
        <span className="block font-display text-[1.05rem] leading-snug text-ink">
          {value}
        </span>
        {note && <span className="mt-1 block text-xs leading-snug text-ink-faint">{note}</span>}
      </dd>
    </>
  );
  return (
    <div className="px-3 text-center sm:px-6 sm:py-8">
      {href ? (
        <a
          href={href}
          className="nod-on-hover block rounded-md transition-colors hover:text-brass"
          {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer noopener" } : {})}
        >
          {body}
        </a>
      ) : (
        body
      )}
    </div>
  );
}

/**
 * The first clause of a dress code, for the strip. "Cocktail - and bring
 * a layer, it turns cold once the sun goes" is the whole thing in the
 * details; up top it is "Cocktail".
 */
function headline(text: string): string {
  return text.split(/\s[-–—]\s|[.,;:(]/)[0].trim() || text;
}

/**
 * The last comma-separated part of the address, which for
 * "482 Hamurana Road, Rotorua" is the town.
 */
function townFrom(address: string): string {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) ?? address;
}
