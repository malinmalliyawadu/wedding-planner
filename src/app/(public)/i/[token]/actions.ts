"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { isInviteTokenShape } from "@/lib/invite-token";
import { submitRsvp, type RsvpAnswer } from "@/lib/public/mutations";
import {
  MAX_SONG_REQUESTS,
  MAX_SONG_TEXT,
  normaliseSongRequests,
  type SongRequest,
} from "@/lib/songs";

/**
 * The one thing a guest can write. Reached with no authentication at all,
 * so it trusts the token and nothing else in the payload: the household
 * is resolved from the token server-side, and any guest id that does not
 * belong to that household is dropped rather than obeyed.
 */

const optionalText = (max: number, label: string) =>
  z
    .string()
    .max(max, `${label} is a little long - keep it under ${max} characters`)
    .trim()
    .transform((value) => (value === "" ? null : value));

const submissionSchema = z.object({
  token: z.string().refine(isInviteTokenShape, "That invitation link is not valid"),
  message: optionalText(1000, "Your note"),
});

/**
 * One song as the picker posts it: three fields per slot, the id only
 * when it was picked from the catalogue. The id is opaque to this app -
 * it is stored for provenance and never looked up - so the only rule
 * on it is that it is short and plain.
 */
const songSchema = z.object({
  title: z.string().max(MAX_SONG_TEXT, "That song title is a little long"),
  artist: z.string().max(MAX_SONG_TEXT, "That artist name is a little long"),
  externalId: z.string().regex(/^[\w-]{0,64}$/, "That song did not come through"),
});

function readSongs(formData: FormData): SongRequest[] | string {
  const songs: SongRequest[] = [];
  for (let slot = 0; slot < MAX_SONG_REQUESTS; slot++) {
    const title = formData.get(`song-${slot}-title`);
    if (typeof title !== "string") continue;
    const parsed = songSchema.safeParse({
      title,
      artist: formData.get(`song-${slot}-artist`) ?? "",
      externalId: formData.get(`song-${slot}-id`) ?? "",
    });
    if (!parsed.success) return parsed.error.issues[0].message;
    songs.push({
      title: parsed.data.title,
      artist: parsed.data.artist || null,
      externalId: parsed.data.externalId || null,
    });
  }
  return normaliseSongRequests(songs);
}

export async function respondToInvitation(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = submissionSchema.safeParse({
    token: formData.get("token") ?? "",
    message: formData.get("message") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }

  const songs = readSongs(formData);
  if (typeof songs === "string") {
    return { status: "error", message: songs };
  }

  const answers: RsvpAnswer[] = [];
  for (const [key, value] of formData.entries()) {
    const match = /^attending-(\d+)$/.exec(key);
    if (!match || typeof value !== "string") continue;

    const guestId = Number(match[1]);
    if (!Number.isSafeInteger(guestId)) continue;

    const attending = value === "yes";
    const diet = formData.get(`diet-${guestId}`);
    answers.push({
      guestId,
      attending,
      // A declining guest's dietary note is meaningless, and keeping one
      // would quietly inflate the caterer's count of special plates.
      dietaryNotes:
        attending && typeof diet === "string" && diet.trim() !== ""
          ? diet.trim().slice(0, 300)
          : null,
    });
  }

  if (answers.length === 0) {
    return { status: "error", message: "Let us know who can come" };
  }

  const saved = await submitRsvp(parsed.data.token, {
    answers,
    message: parsed.data.message,
    songRequests: songs,
  });
  if (!saved) {
    return {
      status: "error",
      message: "We could not save that reply. Try the link from your invitation again.",
    };
  }

  revalidatePath(`/i/${parsed.data.token}`);
  return { status: "success" };
}
