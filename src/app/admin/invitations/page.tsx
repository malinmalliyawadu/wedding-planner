import { asc } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { ListMusic, PenLine } from "lucide-react";
import QRCode from "qrcode";
import { db } from "@/db";
import { guests, households, publicSite, songRequests } from "@/db/schema";
import { EmptyState, PageHeader } from "@/components/ui";
import { formatMomentNZ } from "@/lib/dates";
import { inviteUrl } from "@/lib/invite-token";
import { describeSong } from "@/lib/songs";
import {
  buildChaseList,
  countAttending,
  householdStatus,
  outstandingIn,
  repliedHouseholds,
  type RsvpHousehold,
} from "@/lib/rsvp-summary";
import { InvitationFilters } from "./filters";
import { InviteRow, type InviteRowData } from "./invite-row";
import { PublishToggle } from "./publish-toggle";
import { parseView } from "./views";

export const dynamic = "force-dynamic";

const ACTION_LINK =
  "inline-flex min-h-9 items-center gap-2 rounded-md border border-hairline-strong bg-card px-4 text-sm text-ink transition-colors hover:border-ink-faint";

/**
 * The couple's view of the invitation: whether it is live, where the
 * numbers stand, and one row per household carrying its status, its link
 * and - opened - its reply. The filter above the list is the old chase
 * list and list of replies, as two views of the same rows rather than two
 * more copies of them.
 *
 * The origin is taken from the request rather than configured, because
 * the only thing a link has to match is the domain the couple are
 * looking at it on. Nothing to set, nothing to get wrong on a rename.
 */
export default async function InvitationsPage({
  searchParams,
}: PageProps<"/admin/invitations">) {
  const params = await searchParams;
  const view = parseView(params.show);
  const q = typeof params.q === "string" ? params.q.trim().toLowerCase() : "";

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

  const songsByHousehold = new Map<number, string[]>();
  for (const song of songRows) {
    const list = songsByHousehold.get(song.householdId) ?? [];
    list.push(describeSong(song));
    songsByHousehold.set(song.householdId, list);
  }

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

  // Each view has its own order: the ones to chase in the order worth
  // working through them, replies newest first, everyone by name.
  const shown = (
    view === "chase"
      ? chase.map((entry) => entry.household)
      : view === "replied"
        ? replied
        : enriched
  ).filter((household) => q === "" || household.name.toLowerCase().includes(q));

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

  const rowByHousehold = new Map(householdRows.map((h) => [h.id, h]));
  const rows: InviteRowData[] = shown.map((household) => {
    const row = rowByHousehold.get(household.id)!;
    return {
      id: household.id,
      name: household.name,
      address: row.address,
      url: row.inviteToken ? inviteUrl(origin, row.inviteToken) : null,
      qr: qrCodes.get(household.id) ?? null,
      status: householdStatus(household),
      outstanding: outstandingIn(household),
      coming: countAttending(household.guests).bodies,
      repliedAt: row.rsvpRespondedAt ? formatMomentNZ(row.rsvpRespondedAt) : null,
      message: row.rsvpMessage,
      people: (byHousehold.get(household.id) ?? []).map((person) => ({
        id: person.id,
        name: `${person.firstName} ${person.lastName}`,
        ageBracket: person.ageBracket,
        rsvpStatus: person.rsvpStatus,
        dietaryNotes: person.dietaryNotes,
      })),
      songs: songsByHousehold.get(household.id) ?? [],
    };
  });

  const stats = [
    {
      label: "Coming",
      value: total.bodies,
      hint: `${total.catered} catered`,
      href: "/admin/guests?rsvp=attending",
    },
    {
      label: "Replied",
      value: replied.length,
      hint: `of ${enriched.length} households`,
      href: "/admin/invitations?show=replied",
    },
    {
      label: "To chase",
      value: chase.length,
      hint: withoutLinks > 0 ? `${withoutLinks} with no link` : "everyone has a link",
      href: "/admin/invitations?show=chase",
    },
  ] as const;

  const empty =
    householdRows.length === 0
      ? {
          title: "No households yet",
          hint: "Households come from the guest list. Add people there and their households appear here.",
        }
      : q !== ""
        ? { title: "No household matches", hint: "Try a shorter name." }
        : view === "chase"
          ? { title: "Everyone has answered", hint: "Nothing to chase. Enjoy the feeling." }
          : { title: "No replies yet", hint: "They will appear here as households answer." };

  return (
    <>
      <PageHeader
        eyebrow="The public side"
        title="Invitations"
        actions={
          <>
            <Link href="/admin/invitations/playlist" className={ACTION_LINK}>
              <ListMusic className="size-4" aria-hidden />
              The playlist
            </Link>
            <Link href="/admin/invitations/content" className={ACTION_LINK}>
              <PenLine className="size-4" aria-hidden />
              Edit what it says
            </Link>
          </>
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
       * Where the numbers stand. Each is a way into the list below.
       * ------------------------------------------------------------- */}
      <div className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline sm:grid-cols-3">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="group bg-card px-5 py-4 transition-colors duration-150 hover:bg-brass-tint/30"
          >
            <p className="eyebrow text-ink-faint transition-colors duration-150 group-hover:text-brass">
              {stat.label}
            </p>
            <p className="figures mt-2 text-3xl text-ink">{stat.value}</p>
            <p className="mt-1 text-xs text-ink-faint">{stat.hint}</p>
          </Link>
        ))}
      </div>

      {/* ------------------------------------------------------------- *
       * The households, one row each.
       * ------------------------------------------------------------- */}
      <section className="mt-10 pb-4">
        <h2 className="font-display text-xl text-ink">Households</h2>
        <div className="mt-4">
          <InvitationFilters />
        </div>
        {rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState title={empty.title} hint={empty.hint} />
          </div>
        ) : (
          <ul className="mt-4 rounded-lg border border-hairline bg-card px-5 shadow-card">
            {rows.map((household) => (
              <InviteRow key={household.id} household={household} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
