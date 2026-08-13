import { and, asc, desc, eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import {
  faqItems,
  guests,
  households,
  photos,
  publicSite,
  runSheetItems,
  settings,
  tables,
} from "@/db/schema";
import { isInviteTokenShape } from "@/lib/invite-token";

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

export type Invitation = {
  householdId: number;
  token: string;
  householdName: string;
  address: string | null;
  guests: PublicGuest[];
  respondedAt: Date | null;
  message: string | null;
  songRequest: string | null;
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
        songRequest: households.songRequest,
      })
      .from(households)
      .where(eq(households.inviteToken, token))
      .limit(1);
    if (!household) return null;

    const site = await getSiteContent();
    if (!site) return null;

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
      songRequest: household.songRequest,
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
