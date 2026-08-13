import { buildCalendar } from "@/lib/ics";
import { getInvitation, getSiteContent } from "@/lib/public/queries";

/**
 * The wedding as a calendar file, so "what was the date again?" is
 * answered once and never asked.
 *
 * All-day rather than timed on purpose: a guest's phone is not
 * necessarily in Pacific/Auckland, and an all-day event lands on the
 * right date everywhere, whereas a timed one drifts by a day for anyone
 * reading it from the other side of the date line. The ceremony time is
 * in the description, where a timezone cannot move it.
 *
 * The UID is derived from the invitation rather than being random, so
 * re-downloading replaces the entry instead of stacking up duplicates.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/i/[token]/wedding.ics">) {
  const { token } = await context.params;
  const [invitation, site] = await Promise.all([
    getInvitation(token),
    getSiteContent(),
  ]);
  if (!invitation || !site?.weddingDate) {
    return new Response("Not found", { status: 404 });
  }

  const couple = [site.partnerAName, site.partnerBName]
    .filter(Boolean)
    .join(" & ");

  const detail = [
    site.ceremonyTime && `Ceremony at ${site.ceremonyTime.slice(0, 5)}`,
    site.arrivalTime && `Please arrive by ${site.arrivalTime.slice(0, 5)}`,
    site.venueName,
    site.venueAddress,
    site.dressCode && `Dress: ${site.dressCode}`,
  ]
    .filter(Boolean)
    .join("\n");

  const body = buildCalendar(
    [
      {
        uid: `wedding-${invitation.householdId}@the-wedding-ledger`,
        date: site.weddingDate,
        summary: couple ? `${couple} - wedding` : "The wedding",
        description: detail || undefined,
      },
    ],
    { name: couple || "The wedding" },
  );

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="wedding.ics"',
      // A wedding date can move. Nothing in between should cache it.
      "Cache-Control": "no-store",
    },
  });
}
