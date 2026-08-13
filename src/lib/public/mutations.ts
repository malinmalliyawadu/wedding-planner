import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { guests, households, photos, publicSite } from "@/db/schema";
import { isInviteTokenShape } from "@/lib/invite-token";

/**
 * The only writes an unauthenticated visitor can cause.
 *
 * Every one of them re-resolves the token itself rather than trusting a
 * household id from the form: a hidden field is a thing an attacker
 * controls, and RSVPing on someone else's behalf is exactly the mischief
 * a public form invites. The token is the only identity here, so it is
 * the only identity these functions accept.
 */

export type RsvpAnswer = {
  guestId: number;
  attending: boolean;
  dietaryNotes: string | null;
};

export type RsvpSubmission = {
  answers: RsvpAnswer[];
  message: string | null;
  songRequest: string | null;
};

async function resolveOpenHousehold(token: string): Promise<number | null> {
  if (!isInviteTokenShape(token)) return null;
  const [site] = await db
    .select({ published: publicSite.published })
    .from(publicSite)
    .limit(1);
  if (!site?.published) return null;

  const [household] = await db
    .select({ id: households.id })
    .from(households)
    .where(eq(households.inviteToken, token))
    .limit(1);
  return household?.id ?? null;
}

/**
 * Record a household's reply. Returns false when the token does not
 * resolve, which the caller reports as a generic failure - telling a
 * stranger whether a token exists is a free oracle.
 */
export async function submitRsvp(
  token: string,
  submission: RsvpSubmission,
): Promise<boolean> {
  const householdId = await resolveOpenHousehold(token);
  if (householdId === null) return false;

  const ids = submission.answers.map((a) => a.guestId);
  if (ids.length === 0) return false;

  // Which of the submitted ids actually belong to this household. Anything
  // else in the form is discarded rather than rejected: a stale tab is a
  // likelier explanation than an attack, and the honest answers still land.
  const own = await db
    .select({ id: guests.id })
    .from(guests)
    .where(and(eq(guests.householdId, householdId), inArray(guests.id, ids)));
  const ownIds = new Set(own.map((g) => g.id));
  const permitted = submission.answers.filter((a) => ownIds.has(a.guestId));
  if (permitted.length === 0) return false;

  await db.transaction(async (tx) => {
    for (const answer of permitted) {
      await tx
        .update(guests)
        .set({
          rsvpStatus: answer.attending ? "attending" : "declined",
          dietaryNotes: answer.dietaryNotes,
        })
        .where(eq(guests.id, answer.guestId));
    }

    await tx
      .update(households)
      .set({
        rsvpMessage: submission.message,
        songRequest: submission.songRequest,
        rsvpRespondedAt: new Date(),
        // Replying is what "confirmed" means; the couple no longer have
        // to move this by hand for every household that answers.
        inviteStage: "confirmed",
      })
      .where(eq(households.id, householdId));
  });

  return true;
}

/**
 * Index an object that has already been accepted by the bucket. Returns
 * the new row's id, or null if the token no longer resolves - in which
 * case the object is left orphaned rather than indexed, which is the
 * safe direction to fail.
 */
export async function registerPhoto(
  token: string,
  photo: {
    storageKey: string;
    thumbStorageKey: string;
    contentType: string;
    byteSize: number;
    /** Stored so the gallery can reserve the right box and not reflow. */
    width: number;
    height: number;
    caption: string | null;
    uploaderName: string | null;
  },
): Promise<number | null> {
  const householdId = await resolveOpenHousehold(token);
  if (householdId === null) return null;

  const [site] = await db
    .select({ photosEnabled: publicSite.photosEnabled })
    .from(publicSite)
    .limit(1);
  if (!site?.photosEnabled) return null;

  const [row] = await db
    .insert(photos)
    .values({ ...photo, householdId })
    .returning({ id: photos.id });
  return row?.id ?? null;
}

/** Whether uploads are open at all, for the upload screen's empty state. */
export async function photosAreOpen(token: string): Promise<boolean> {
  if ((await resolveOpenHousehold(token)) === null) return false;
  const [site] = await db
    .select({ photosEnabled: publicSite.photosEnabled })
    .from(publicSite)
    .limit(1);
  return site?.photosEnabled ?? false;
}
