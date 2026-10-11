"use server";

import { z } from "zod";
import { describeRefusal } from "@/lib/dj-queue";
import { requestDanceSong, voteOnDanceSong } from "@/lib/public/mutations";
import { MAX_SONG_TEXT } from "@/lib/songs";

/**
 * The dance floor's two public actions. Both take the token and nothing
 * that names a household: `src/lib/public/mutations.ts` re-resolves who
 * is asking from the token, as every public write does.
 */

const songSchema = z.object({
  title: z.string().max(MAX_SONG_TEXT),
  artist: z.string().max(MAX_SONG_TEXT).nullable(),
  externalId: z.string().max(64).nullable(),
});

export type FloorActionResult = { ok: true } | { ok: false; message: string };

export async function requestSong(
  token: string,
  song: { title: string; artist: string | null; externalId: string | null },
): Promise<FloorActionResult> {
  const parsed = songSchema.safeParse(song);
  if (!parsed.success) return { ok: false, message: "That song could not be added." };

  const outcome = await requestDanceSong(token, parsed.data);
  if (outcome.ok) return outcome;
  if (outcome.reason === "closed") {
    return { ok: false, message: "Requests are closed at the moment." };
  }
  if (outcome.reason === "empty") return { ok: false, message: "Which song?" };
  return { ok: false, message: describeRefusal(outcome.reason) };
}

export async function voteOnSong(
  token: string,
  itemId: number,
  kind: "up" | "skip",
  on: boolean,
): Promise<FloorActionResult> {
  if (kind !== "up" && kind !== "skip") return { ok: false, message: "Unknown vote." };
  const counted = await voteOnDanceSong(token, itemId, kind, on === true);
  // A vote on a song that has just moved on is not worth an error: the
  // page refreshes and the guest sees where it went.
  return counted ? { ok: true } : { ok: false, message: "That song has moved on." };
}
