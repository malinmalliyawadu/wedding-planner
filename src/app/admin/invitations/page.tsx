import { asc } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import QRCode from "qrcode";
import { db } from "@/db";
import { guests, households, publicSite, songRequests } from "@/db/schema";
import { Chip, EmptyState, PageHeader } from "@/components/ui";
import { inviteUrl } from "@/lib/invite-token";
import { describeSong, songKey } from "@/lib/songs";
import {
  buildChaseList,
  countAttending,
  repliedHouseholds,
  type RsvpHousehold,
} from "@/lib/rsvp-summary";
import { InviteRow } from "./invite-row";
import { PublishToggle } from "./publish-toggle";

export const dynamic = "force-dynamic";

/**
 * The couple's view of the invitation: whether it is live, who has a
 * link, who has replied and who needs chasing.
 *
 * The origin is taken from the request rather than configured, because
 * the only thing a link has to match is the domain the couple are
 * looking at it on. Nothing to set, nothing to get wrong on a rename.
 */
export default async function InvitationsPage() {
  const [headerList, [site], householdRows, guestRows, songRows] = await Promise.all([
    headers(),
    db.select().from(publicSite).limit(1),
    db.select().from(households).orderBy(asc(households.name)),
    db
      .select({
        id: guests.id,
        householdId: guests.householdId,
        firstName: guests.firstName,
        lastName: guests.lastName,
        ageBracket: guests.ageBracket,
        rsvpStatus: guests.rsvpStatus,
        dietaryNotes: guests.dietaryNotes,
      })
      .from(guests)
      .orderBy(asc(guests.id)),
    db.select().from(songRequests).orderBy(asc(songRequests.id)),
  ]);

  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  const origin = `${protocol}://${host}`;

  const byHousehold = new Map<number, typeof guestRows>();
  for (const guest of guestRows) {
    const list = byHousehold.get(guest.householdId) ?? [];
    list.push(guest);
    byHousehold.set(guest.householdId, list);
  }

  const songsByHousehold = new Map<number, typeof songRows>();
  for (const song of songRows) {
    const list = songsByHousehold.get(song.householdId) ?? [];
    list.push(song);
    songsByHousehold.set(song.householdId, list);
  }

  // The playlist: one line per song however many households asked,
  // matched the same way the invitation matches them, so what the couple
  // see here and what a guest is told on the card cannot disagree.
  const householdName = new Map(householdRows.map((h) => [h.id, h.name]));
  const playlist = new Map<
    string,
    { title: string; artist: string | null; householdIds: Set<number> }
  >();
  for (const song of songRows) {
    const key = songKey(song.title, song.artist);
    const entry = playlist.get(key) ?? {
      title: song.title,
      artist: song.artist,
      householdIds: new Set<number>(),
    };
    // A picked request carries title and artist apart; a typed one has
    // them run together on one line. Show the picked form when there is
    // one, whichever household's came first.
    if (!entry.artist && song.artist) {
      entry.title = song.title;
      entry.artist = song.artist;
    }
    entry.householdIds.add(song.householdId);
    playlist.set(key, entry);
  }
  const playlistRows = [...playlist.values()].sort(
    (a, b) =>
      b.householdIds.size - a.householdIds.size ||
      a.title.localeCompare(b.title),
  );
  const askedElsewhere = (song: { title: string; artist: string | null }) =>
    (playlist.get(songKey(song.title, song.artist))?.householdIds.size ?? 1) - 1;

  const enriched: RsvpHousehold[] = householdRows.map((household) => ({
    id: household.id,
    name: household.name,
    inviteToken: household.inviteToken,
    respondedAt: household.rsvpRespondedAt,
    guests: byHousehold.get(household.id) ?? [],
  }));

  const published = site?.published ?? false;
  const chase = buildChaseList(enriched);
  const replied = repliedHouseholds(enriched);
  const total = countAttending(guestRows);
  const withoutLinks = householdRows.filter((h) => h.inviteToken === null).length;

  // Only for the households that have a link, and only once per page.
  const qrCodes = new Map<number, string>();
  await Promise.all(
    householdRows
      .filter((household) => household.inviteToken !== null)
      .map(async (household) => {
        qrCodes.set(
          household.id,
          await QRCode.toDataURL(inviteUrl(origin, household.inviteToken!), {
            margin: 1,
            width: 376,
            color: { dark: "#212b25ff", light: "#ffffffff" },
          }),
        );
      }),
  );

  const CHASE_LABELS = {
    partial: "Half answered",
    not_replied: "No reply yet",
    no_link: "No link sent",
  } as const;

  return (
    <>
      <PageHeader
        eyebrow="The public side"
        title="Invitations"
        actions={
          <Link
            href="/admin/invitations/content"
            className="inline-flex min-h-9 items-center rounded-md border border-hairline-strong bg-card px-4 text-sm text-ink transition-colors hover:border-ink-faint"
          >
            Edit what it says
          </Link>
        }
      >
        <p className="mt-3 max-w-2xl text-sm text-ink-soft">
          Every household gets its own link. The link is the only thing
          standing between a stranger and your guest list, so send it to
          people rather than posting it anywhere.
        </p>
      </PageHeader>

      <PublishToggle published={published} />

      {/* ------------------------------------------------------------- *
       * Where the numbers stand.
       * ------------------------------------------------------------- */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Coming", value: total.bodies, hint: `${total.catered} catered` },
          { label: "Replied", value: replied.length, hint: `of ${enriched.length} households` },
          { label: "To chase", value: chase.length, hint: withoutLinks > 0 ? `${withoutLinks} with no link` : "everyone has a link" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-hairline bg-card p-5 shadow-card"
          >
            <p className="eyebrow text-ink-faint">{stat.label}</p>
            <p className="figures mt-2 text-3xl text-ink">{stat.value}</p>
            <p className="mt-1 text-xs text-ink-faint">{stat.hint}</p>
          </div>
        ))}
      </div>

      {/* ------------------------------------------------------------- *
       * Who to nudge.
       * ------------------------------------------------------------- */}
      <section className="mt-10">
        <h2 className="font-display text-xl text-ink">Still to hear from</h2>
        {chase.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Everyone has answered"
              hint="Nothing to chase. Enjoy the feeling."
            />
          </div>
        ) : (
          <ul className="mt-4 rounded-lg border border-hairline bg-card px-5 shadow-card">
            {chase.map(({ household, reason, outstanding }) => (
              <li
                key={household.id}
                className="flex items-center justify-between gap-3 border-t border-hairline py-3 first:border-t-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {household.name}
                  </p>
                  <p className="text-xs text-ink-faint">
                    <span className="figures">{outstanding}</span>
                    {outstanding === 1 ? " person" : " people"} outstanding
                  </p>
                </div>
                <Chip tone={reason === "no_link" ? "madder" : "brass"}>
                  {CHASE_LABELS[reason]}
                </Chip>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------------- *
       * What people said.
       * ------------------------------------------------------------- */}
      <section className="mt-10">
        <h2 className="font-display text-xl text-ink">Replies</h2>
        {replied.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No replies yet"
              hint="They will appear here as households answer."
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {replied.map((household) => {
              const row = householdRows.find((h) => h.id === household.id)!;
              const people = byHousehold.get(household.id) ?? [];
              return (
                <li
                  key={household.id}
                  className="rounded-lg border border-hairline bg-card p-5 shadow-card"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-display text-lg text-ink">
                      {household.name}
                    </p>
                    <p className="figures text-xs text-ink-faint">
                      {countAttending(people).bodies} of {people.length} coming
                    </p>
                  </div>

                  <ul className="mt-3 space-y-1.5">
                    {people.map((person) => (
                      <li
                        key={person.id}
                        className="flex flex-wrap items-center gap-2 text-sm"
                      >
                        <span
                          className={
                            person.rsvpStatus === "attending"
                              ? "text-ink"
                              : "text-ink-faint line-through"
                          }
                        >
                          {person.firstName} {person.lastName}
                        </span>
                        {person.rsvpStatus === "attending" &&
                          person.dietaryNotes && (
                            <Chip tone="brass">{person.dietaryNotes}</Chip>
                          )}
                      </li>
                    ))}
                  </ul>

                  {(songsByHousehold.get(household.id) ?? []).length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {(songsByHousehold.get(household.id) ?? []).map((song) => {
                        const others = askedElsewhere(song);
                        return (
                          <li
                            key={song.id}
                            className="flex flex-wrap items-center gap-2 text-sm text-ink-soft"
                          >
                            <span className="eyebrow text-ink-faint">Song</span>
                            {describeSong(song)}
                            {others > 0 && (
                              <Chip tone="brass">
                                also asked for by {others} other{others === 1 ? "" : "s"}
                              </Chip>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {row.rsvpMessage && (
                    <p className="mt-2 border-l-2 border-brass-tint pl-3 text-sm whitespace-pre-line text-ink-soft italic">
                      {row.rsvpMessage}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------------- *
       * Every song asked for, as one playlist.
       * ------------------------------------------------------------- */}
      <section className="mt-10">
        <h2 className="font-display text-xl text-ink">The playlist</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Every song asked for on a reply card, the most requested first,
          with who asked for it. A song two households both picked is
          listed once.
        </p>
        {playlistRows.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No requests yet"
              hint="Songs guests ask for on the reply card will collect here."
            />
          </div>
        ) : (
          <ul className="mt-4 rounded-lg border border-hairline bg-card px-5 shadow-card">
            {playlistRows.map((song) => (
              <li
                key={`${song.title}|${song.artist ?? ""}`}
                className="flex items-center justify-between gap-3 border-t border-hairline py-3 first:border-t-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{song.title}</p>
                  <p className="truncate text-xs text-ink-faint">
                    {song.artist ?? "Typed in, no artist given"}
                  </p>
                  {/* Which reply card it came off. The whole list is
                      household by household above; this is the same fact
                      the other way round, so a song can be traced back
                      without scrolling for it. */}
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {[...song.householdIds]
                      .map((id) => householdName.get(id) ?? "Unknown household")
                      .join(", ")}
                  </p>
                </div>
                {song.householdIds.size > 1 && (
                  <Chip tone="brass">
                    <span className="figures">{song.householdIds.size}</span> households
                  </Chip>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------------- *
       * The links themselves.
       * ------------------------------------------------------------- */}
      <section className="mt-10 pb-4">
        <h2 className="font-display text-xl text-ink">Links and QR codes</h2>
        <p className="mt-1 text-sm text-ink-soft">
          A QR code is what goes on the table card on the night, so guests
          can reach the photo album without typing anything.
        </p>
        <ul className="mt-4 rounded-lg border border-hairline bg-card px-5 shadow-card">
          {householdRows.map((household) => {
            const people = byHousehold.get(household.id) ?? [];
            const answered =
              people.length > 0 &&
              people.every((person) => person.rsvpStatus !== "pending");
            return (
              <InviteRow
                key={household.id}
                householdId={household.id}
                name={household.name}
                address={household.address}
                url={
                  household.inviteToken
                    ? inviteUrl(origin, household.inviteToken)
                    : null
                }
                qr={qrCodes.get(household.id) ?? null}
                status={
                  answered
                    ? { label: "Replied", tone: "fern" }
                    : household.inviteToken
                      ? { label: "Waiting", tone: "brass" }
                      : { label: "No link", tone: "neutral" }
                }
              />
            );
          })}
        </ul>
      </section>
    </>
  );
}
