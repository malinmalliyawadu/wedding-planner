import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  djFloor,
  djQueueItems,
  djVotes,
  guests,
  households,
  photos,
  publicSite,
  songRequests,
} from "@/db/schema";
import { fillCoversLater } from "@/lib/dj-cover";
import {
  askerColumns,
  checkRequest,
  type Asker,
  type RequestRefusal,
  type VoteKind,
} from "@/lib/dj-queue";
import { isInviteTokenShape } from "@/lib/invite-token";
import { ensurePhoneKey } from "@/lib/public/dance-phone";
import { getRequestContext, isDanceShareCode } from "@/lib/public/queries";
import {
  cleanSongText,
  normaliseSongRequests,
  songKey,
  type SongRequest,
} from "@/lib/songs";

/**
 * The only writes an unauthenticated visitor can cause.
 *
 * Every one of them re-resolves the token itself rather than trusting a
 * household id from the form: a hidden field is a thing an attacker
 * controls, and RSVPing on someone else's behalf is exactly the mischief
 * a public form invites. The token is the only identity here, so it is
 * the only identity these functions accept - with one exception, the
 * dance floor's venue QR code, whose identity is the phone's own cookie
 * (`dance-phone.ts`), read here and never taken from the caller either.
 */

export type RsvpAnswer = {
  guestId: number;
  attending: boolean;
  dietaryNotes: string | null;
};

export type RsvpSubmission = {
  answers: RsvpAnswer[];
  message: string | null;
  /** Replaces the household's list whole; tidied and capped here as well. */
  songRequests: SongRequest[];
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
        rsvpRespondedAt: new Date(),
        // Replying is what "confirmed" means; the couple no longer have
        // to move this by hand for every household that answers.
        inviteStage: "confirmed",
      })
      .where(eq(households.id, householdId));

    // The card is sent whole, so the list is replaced whole: a song
    // taken off the card comes off the playlist too.
    await tx.delete(songRequests).where(eq(songRequests.householdId, householdId));
    const songs = normaliseSongRequests(submission.songRequests);
    if (songs.length > 0) {
      await tx
        .insert(songRequests)
        .values(songs.map((song) => ({ ...song, householdId })));
    }
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

// ---------------------------------------------------------------------------
// The dance floor.

/**
 * How a guest came in: their household's invitation link, or the QR code
 * at the venue. The QR code's asker is the phone's cookie, which is read
 * (or minted) here rather than taken from the caller, as a household is
 * re-resolved from its token rather than taken from a form.
 */
export type DanceCredential = { token: string } | { shareCode: string };

/** The asker behind a credential, when it is good and the dance floor is open; else null. */
async function resolveDancer(credential: DanceCredential): Promise<Asker | null> {
  let asker: Asker;
  if ("token" in credential) {
    const householdId = await resolveOpenHousehold(credential.token);
    if (householdId === null) return null;
    asker = { householdId };
  } else {
    if (!(await isDanceShareCode(credential.shareCode))) return null;
    asker = { phoneKey: await ensurePhoneKey() };
  }
  const [floor] = await db.select({ open: djFloor.open }).from(djFloor).limit(1);
  return floor?.open ? asker : null;
}

export type SongRequestOutcome =
  | { ok: true }
  | { ok: false; reason: RequestRefusal | "closed" | "empty" };

/**
 * Add a song to the queue for this asker, with their vote for it. The
 * unique index on active song keys is the last word on duplicates: two
 * phones adding the same song in the same second both pass the check, and
 * the second insert finds the first already there.
 */
export async function requestDanceSong(
  credential: DanceCredential,
  song: SongRequest,
): Promise<SongRequestOutcome> {
  const asker = await resolveDancer(credential);
  if (asker === null) return { ok: false, reason: "closed" };

  const title = cleanSongText(song.title);
  if (title === "") return { ok: false, reason: "empty" };
  const artist = cleanSongText(song.artist) || null;
  const externalId = cleanSongText(song.externalId) || null;
  const key = songKey(title, artist);

  const now = new Date();
  const verdict = checkRequest(key, asker, await getRequestContext(now), now);
  if (!verdict.ok) return verdict;

  const who = askerColumns(asker);
  const added = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(djQueueItems)
      .values({ title, artist, externalId, songKey: key, ...who })
      .onConflictDoNothing()
      .returning({ id: djQueueItems.id });
    if (!row) return null;
    await tx.insert(djVotes).values({ itemId: row.id, ...who, kind: "up" });
    return row.id;
  });
  if (added === null) return { ok: false, reason: "already_queued" };
  // Looked up here, never taken from the form: see dj-cover.ts.
  fillCoversLater([added]);
  return { ok: true };
}

/**
 * Cast or take back a vote. An up vote only counts on a song still
 * waiting in the app, a skip only on the song on air: anything else is a
 * stale page, and is quietly ignored rather than reported.
 */
export async function voteOnDanceSong(
  credential: DanceCredential,
  itemId: number,
  kind: VoteKind,
  on: boolean,
): Promise<boolean> {
  const asker = await resolveDancer(credential);
  if (asker === null) return false;
  if (!Number.isSafeInteger(itemId) || itemId <= 0) return false;

  const [item] = await db
    .select({ status: djQueueItems.status })
    .from(djQueueItems)
    .where(eq(djQueueItems.id, itemId))
    .limit(1);
  const votable = kind === "up" ? "queued" : "playing";
  if (item?.status !== votable) return false;

  const mine = and(
    eq(djVotes.itemId, itemId),
    "householdId" in asker
      ? eq(djVotes.householdId, asker.householdId)
      : eq(djVotes.phoneKey, asker.phoneKey),
    eq(djVotes.kind, kind),
  );
  if (on) {
    await db
      .insert(djVotes)
      .values({ itemId, ...askerColumns(asker), kind })
      .onConflictDoNothing();
  } else {
    await db.delete(djVotes).where(mine);
  }
  return true;
}
