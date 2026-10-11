import { and, asc, desc, eq, gt, inArray, ne, or } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import {
  djFloor,
  djQueueItems,
  djVotes,
  faqItems,
  guests,
  households,
  photos,
  publicSite,
  runSheetItems,
  settings,
  songRequests,
  tables,
} from "@/db/schema";
import { isBoothSessionId } from "@/lib/booth";
import {
  ACTIVE_STATUSES,
  MAX_WAITING_PER_HOUSEHOLD,
  REPLAY_GAP_MS,
  tally,
  upcoming,
  type QueueItem,
  type Vote,
} from "@/lib/dj-queue";
import { isInviteTokenShape } from "@/lib/invite-token";
import { songKey } from "@/lib/songs";

/**
 * Everything the unauthenticated invitation is allowed to know.
 *
 * This module exists so the answer to "can a guest see the budget?" is a
 * property of the code rather than a promise. Pages under `src/app/i` do
 * not import `@/db` or `@/lib/queries` at all - they can only ask for
 * what is shaped here, and nothing here selects a column a guest should
 * not have. `no-private-imports.test.ts` holds that line.
 *
 * Addresses are the one piece of personal data that does cross over, and
 * only a household's own: it is printed on their envelope, the way it
 * would be on a posted invitation.
 */

export type PublicGuest = {
  id: number;
  firstName: string;
  lastName: string;
  ageBracket: "adult" | "child" | "infant";
  rsvpStatus: "pending" | "attending" | "declined";
  dietaryNotes: string | null;
  /** Only ever populated once the couple flip the table reveal on. */
  tableName: string | null;
};

/** One of a household's own song requests, as the reply card shows it back. */
export type PublicSongRequest = {
  title: string;
  artist: string | null;
  externalId: string | null;
  /** Another household asked for this one too. Which household is not said. */
  alsoRequested: boolean;
};

export type Invitation = {
  householdId: number;
  token: string;
  householdName: string;
  address: string | null;
  guests: PublicGuest[];
  respondedAt: Date | null;
  message: string | null;
  songRequests: PublicSongRequest[];
};

export type SiteContent = {
  partnerAName: string;
  partnerBName: string;
  weddingDate: string | null;
  welcomeMessage: string | null;
  venueName: string | null;
  venueAddress: string | null;
  venueMapUrl: string | null;
  arrivalTime: string | null;
  ceremonyTime: string | null;
  dressCode: string | null;
  giftNote: string | null;
  travelNotes: string | null;
  accommodationNotes: string | null;
  rsvpDeadline: string | null;
  photosEnabled: boolean;
  tableRevealEnabled: boolean;
  published: boolean;
};

export type ScheduleMoment = {
  id: number;
  startTime: string;
  endTime: string | null;
  title: string;
  detail: string | null;
  location: string | null;
};

export type FaqEntry = { id: number; question: string; answer: string };

export type GalleryPhoto = {
  id: number;
  caption: string | null;
  uploaderName: string | null;
  width: number | null;
  height: number | null;
  createdAt: Date;
};

/** What the photo booth's QR page may know about a booth session's photograph. */
export type BoothPhoto = {
  id: number;
  width: number | null;
  height: number | null;
  /** Hidden by the couple: the page 404s, the same as the image route would. */
  hidden: boolean;
};

/**
 * The invitation content, deduped per request. Returns null when the
 * site has not been published, which is what makes `published` a real
 * kill switch rather than a label - an unpublished site has no readable
 * pages at all, however good the link.
 */
export const getSiteContent = cache(async (): Promise<SiteContent | null> => {
  const [site] = await db.select().from(publicSite).limit(1);
  if (!site?.published) return null;

  const [couple] = await db
    .select({
      partnerAName: settings.partnerAName,
      partnerBName: settings.partnerBName,
      weddingDate: settings.weddingDate,
    })
    .from(settings)
    .limit(1);

  return {
    partnerAName: couple?.partnerAName ?? "",
    partnerBName: couple?.partnerBName ?? "",
    weddingDate: couple?.weddingDate ?? null,
    welcomeMessage: site.welcomeMessage,
    venueName: site.venueName,
    venueAddress: site.venueAddress,
    venueMapUrl: site.venueMapUrl,
    arrivalTime: site.arrivalTime,
    ceremonyTime: site.ceremonyTime,
    dressCode: site.dressCode,
    giftNote: site.giftNote,
    travelNotes: site.travelNotes,
    accommodationNotes: site.accommodationNotes,
    rsvpDeadline: site.rsvpDeadline,
    photosEnabled: site.photosEnabled,
    tableRevealEnabled: site.tableRevealEnabled,
    published: site.published,
  };
});

/**
 * Look a household up by its invite token. Malformed tokens are turned
 * away on shape alone, so a crawler walking /i/... never reaches the
 * database.
 */
export const getInvitation = cache(
  async (token: string): Promise<Invitation | null> => {
    if (!isInviteTokenShape(token)) return null;

    const [household] = await db
      .select({
        id: households.id,
        name: households.name,
        address: households.address,
        respondedAt: households.rsvpRespondedAt,
        message: households.rsvpMessage,
      })
      .from(households)
      .where(eq(households.inviteToken, token))
      .limit(1);
    if (!household) return null;

    const site = await getSiteContent();
    if (!site) return null;

    const [songs, elsewhere] = await Promise.all([
      db
        .select({
          title: songRequests.title,
          artist: songRequests.artist,
          externalId: songRequests.externalId,
        })
        .from(songRequests)
        .where(eq(songRequests.householdId, household.id))
        .orderBy(asc(songRequests.id)),
      getSongsRequestedElsewhere(household.id),
    ]);

    const rows = await db
      .select({
        id: guests.id,
        firstName: guests.firstName,
        lastName: guests.lastName,
        ageBracket: guests.ageBracket,
        rsvpStatus: guests.rsvpStatus,
        dietaryNotes: guests.dietaryNotes,
        tableName: tables.name,
      })
      .from(guests)
      .leftJoin(tables, eq(guests.tableId, tables.id))
      .where(eq(guests.householdId, household.id))
      .orderBy(asc(guests.id));

    return {
      householdId: household.id,
      token,
      householdName: household.name,
      address: household.address,
      respondedAt: household.respondedAt,
      message: household.message,
      songRequests: songs.map((song) => ({
        ...song,
        alsoRequested: elsewhere.has(songKey(song.title, song.artist)),
      })),
      guests: rows.map((guest) => ({
        ...guest,
        // Withheld until the plan is final, so nobody memorises a table
        // number that later changes.
        tableName: site.tableRevealEnabled ? guest.tableName : null,
      })),
    };
  },
);

/**
 * A household id for a token, or null: malformed, unknown, or the site
 * is not published. The light version of `getInvitation`, for the
 * routes that only need to know the caller holds a live link.
 */
export const getHouseholdIdForToken = cache(
  async (token: string): Promise<number | null> => {
    if (!isInviteTokenShape(token)) return null;
    if (!(await getSiteContent())) return null;
    const [household] = await db
      .select({ id: households.id })
      .from(households)
      .where(eq(households.inviteToken, token))
      .limit(1);
    return household?.id ?? null;
  },
);

/**
 * The songs every *other* household has asked for, as matching keys
 * (`songKey`). A guest learns from this that a song is already on the
 * playlist, and nothing else: not whose it is, not how many, and
 * only ever for songs they searched for themselves.
 */
export const getSongsRequestedElsewhere = cache(
  async (householdId: number): Promise<Set<string>> => {
    const rows = await db
      .select({ title: songRequests.title, artist: songRequests.artist })
      .from(songRequests)
      .where(ne(songRequests.householdId, householdId));
    return new Set(rows.map((row) => songKey(row.title, row.artist)));
  },
);

/**
 * The guest-facing slice of the one canonical run sheet. There is no
 * second schedule to keep in step: an item is on this list exactly when
 * someone ticked "show guests" on the run sheet itself.
 */
export const getGuestSchedule = cache(async (): Promise<ScheduleMoment[]> => {
  return db
    .select({
      id: runSheetItems.id,
      startTime: runSheetItems.startTime,
      endTime: runSheetItems.endTime,
      title: runSheetItems.title,
      // Deliberately guestNote, never detail: detail is the supplier's
      // copy and has no business on a public page.
      detail: runSheetItems.guestNote,
      location: runSheetItems.location,
    })
    .from(runSheetItems)
    .where(eq(runSheetItems.guestVisible, true))
    .orderBy(asc(runSheetItems.startTime), asc(runSheetItems.id));
});

export const getFaq = cache(async (): Promise<FaqEntry[]> => {
  return db
    .select({
      id: faqItems.id,
      question: faqItems.question,
      answer: faqItems.answer,
    })
    .from(faqItems)
    .where(eq(faqItems.published, true))
    .orderBy(asc(faqItems.sortOrder), asc(faqItems.id));
});

/** Newest first: on the night, the last thing uploaded is the interesting one. */
export const getGallery = cache(async (): Promise<GalleryPhoto[]> => {
  return db
    .select({
      id: photos.id,
      caption: photos.caption,
      uploaderName: photos.uploaderName,
      width: photos.width,
      height: photos.height,
      createdAt: photos.createdAt,
    })
    .from(photos)
    .where(eq(photos.hidden, false))
    .orderBy(desc(photos.createdAt), desc(photos.id));
});

/**
 * The photograph the booth sent for one of its sessions, or null when it
 * has not arrived (yet): the guest scans the QR within seconds of the
 * booth finishing, and the upload can be a minute behind on venue wifi.
 * Nothing at all when the site is unpublished, like every other public
 * page. A nonsense ID costs no database trip.
 */
export async function getBoothPhoto(
  sessionId: string,
): Promise<BoothPhoto | null> {
  if (!isBoothSessionId(sessionId)) return null;
  if ((await getSiteContent()) === null) return null;
  const [row] = await db
    .select({
      id: photos.id,
      width: photos.width,
      height: photos.height,
      hidden: photos.hidden,
    })
    .from(photos)
    .where(eq(photos.boothSessionId, sessionId))
    .limit(1);
  return row ?? null;
}

/**
 * The storage key behind a photo id, for the route that streams it.
 * Hidden photographs resolve to null, so hiding one takes it out of
 * circulation rather than merely off the page.
 */
export async function getVisiblePhotoObject(
  id: number,
  size: "full" | "thumb" = "full",
): Promise<{ storageKey: string; contentType: string } | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const [row] = await db
    .select({
      storageKey: photos.storageKey,
      thumbStorageKey: photos.thumbStorageKey,
      contentType: photos.contentType,
    })
    .from(photos)
    .where(and(eq(photos.id, id), eq(photos.hidden, false)))
    .limit(1);
  if (!row) return null;

  return {
    // Falls back to the full copy rather than 404ing: a photograph from
    // before thumbnails existed should still appear, just heavier.
    storageKey:
      size === "thumb" ? (row.thumbStorageKey ?? row.storageKey) : row.storageKey,
    contentType: row.contentType,
  };
}

// ---------------------------------------------------------------------------
// The dance floor.

/** A song on the guests' list. Who asked for it is never said, unless it was you. */
export type FloorSong = {
  id: number;
  title: string;
  artist: string | null;
  upVotes: number;
  /** Your household has voted it up (asking for it counts). */
  votedUp: boolean;
  /** Your household asked for it. */
  mine: boolean;
  /**
   * `next`: djay has it and it is coming. `finding`: djay could not find
   * it and someone is looking. `waiting`: still in the app; votes move it.
   */
  stage: "next" | "finding" | "waiting";
};

export type FloorNowPlaying = {
  id: number;
  title: string;
  artist: string | null;
  skipVotes: number;
  skipVotesNeeded: number;
  votedSkip: boolean;
  mine: boolean;
};

export type DanceFloor = {
  nowPlaying: FloorNowPlaying | null;
  upNext: FloorSong[];
  /** Your household's songs still waiting, against `maxWaiting`. */
  yourWaiting: number;
  maxWaiting: number;
};

/** Whether the request page is open, for the invitation's link to it. */
export const getDanceFloorOpen = cache(async (): Promise<boolean> => {
  const [floor] = await db.select({ open: djFloor.open }).from(djFloor).limit(1);
  return floor?.open ?? false;
});

/**
 * The live queue as one household sees it, or null when the link is not
 * good or the floor is shut. Polled by the page every few seconds, so it
 * reads only what it shows.
 */
export async function getDanceFloor(token: string): Promise<DanceFloor | null> {
  const householdId = await getHouseholdIdForToken(token);
  if (householdId === null) return null;

  const [floor] = await db
    .select({ open: djFloor.open, skipVotesNeeded: djFloor.skipVotesNeeded })
    .from(djFloor)
    .limit(1);
  if (!floor?.open) return null;

  const items: QueueItem[] = await db
    .select({
      id: djQueueItems.id,
      title: djQueueItems.title,
      artist: djQueueItems.artist,
      songKey: djQueueItems.songKey,
      householdId: djQueueItems.householdId,
      status: djQueueItems.status,
      skipRequested: djQueueItems.skipRequested,
      createdAt: djQueueItems.createdAt,
      cuedAt: djQueueItems.cuedAt,
      startedAt: djQueueItems.startedAt,
      endedAt: djQueueItems.endedAt,
    })
    .from(djQueueItems)
    .where(inArray(djQueueItems.status, [...ACTIVE_STATUSES]));

  const votes: Vote[] =
    items.length === 0
      ? []
      : await db
          .select({
            itemId: djVotes.itemId,
            householdId: djVotes.householdId,
            kind: djVotes.kind,
          })
          .from(djVotes)
          .where(inArray(djVotes.itemId, items.map((item) => item.id)));

  const mineVoted = (itemId: number, kind: Vote["kind"]) =>
    votes.some((v) => v.itemId === itemId && v.householdId === householdId && v.kind === kind);
  const ups = tally(votes, "up");
  const skips = tally(votes, "skip");

  const playing = items.find((item) => item.status === "playing");
  const song = (item: QueueItem, stage: FloorSong["stage"]): FloorSong => ({
    id: item.id,
    title: item.title,
    artist: item.artist,
    upVotes: ups.get(item.id) ?? 0,
    votedUp: mineVoted(item.id, "up"),
    mine: item.householdId === householdId,
    stage,
  });
  const byId = (a: QueueItem, b: QueueItem) => a.id - b.id;

  return {
    nowPlaying: playing
      ? {
          id: playing.id,
          title: playing.title,
          artist: playing.artist,
          skipVotes: skips.get(playing.id) ?? 0,
          skipVotesNeeded: floor.skipVotesNeeded,
          votedSkip: mineVoted(playing.id, "skip"),
          mine: playing.householdId === householdId,
        }
      : null,
    upNext: [
      ...items.filter((i) => i.status === "cued").sort(byId).map((i) => song(i, "next")),
      ...items.filter((i) => i.status === "needs_help").sort(byId).map((i) => song(i, "finding")),
      ...upcoming(items, votes).map((i) => song(i, "waiting")),
    ],
    yourWaiting: items.filter(
      (i) => i.householdId === householdId && (i.status === "queued" || i.status === "needs_help"),
    ).length,
    maxWaiting: MAX_WAITING_PER_HOUSEHOLD,
  };
}

/**
 * The requests `checkRequest` needs to judge a new one: everything active,
 * and anything that went off air inside the replay gap.
 */
export async function getRequestContext(now: Date): Promise<QueueItem[]> {
  return db
    .select({
      id: djQueueItems.id,
      title: djQueueItems.title,
      artist: djQueueItems.artist,
      songKey: djQueueItems.songKey,
      householdId: djQueueItems.householdId,
      status: djQueueItems.status,
      skipRequested: djQueueItems.skipRequested,
      createdAt: djQueueItems.createdAt,
      cuedAt: djQueueItems.cuedAt,
      startedAt: djQueueItems.startedAt,
      endedAt: djQueueItems.endedAt,
    })
    .from(djQueueItems)
    .where(
      or(
        inArray(djQueueItems.status, [...ACTIVE_STATUSES]),
        gt(djQueueItems.endedAt, new Date(now.getTime() - REPLAY_GAP_MS)),
      ),
    );
}
