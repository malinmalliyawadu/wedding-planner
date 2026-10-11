import { z } from "zod";
import { describeRefusal } from "@/lib/dj-queue";
import type { SongRequestOutcome } from "@/lib/public/mutations";
import { MAX_SONG_TEXT, type SongRequest } from "@/lib/songs";

/**
 * What the dance floor's actions say back, shared by its two doors (the
 * invitation link and the venue's QR code) so a guest is told the same
 * thing whichever way they came in. Not a server action module itself:
 * the two `actions.ts` files are, and each resolves its own credential.
 */

export type FloorActionResult = { ok: true } | { ok: false; message: string };

export type FloorSongInput = { title: string; artist: string | null; externalId: string | null };

const songSchema = z.object({
  title: z.string().max(MAX_SONG_TEXT),
  artist: z.string().max(MAX_SONG_TEXT).nullable(),
  externalId: z.string().max(64).nullable(),
});

export function parseFloorSong(song: unknown): SongRequest | null {
  const parsed = songSchema.safeParse(song);
  return parsed.success ? parsed.data : null;
}

export function floorRequestResult(outcome: SongRequestOutcome): FloorActionResult {
  if (outcome.ok) return outcome;
  if (outcome.reason === "closed") return { ok: false, message: "Requests are closed at the moment." };
  if (outcome.reason === "empty") return { ok: false, message: "Which song?" };
  return { ok: false, message: describeRefusal(outcome.reason) };
}

/**
 * A vote on a song that has just moved on is not worth an error: the page
 * refreshes and the guest sees where it went.
 */
export function floorVoteResult(counted: boolean): FloorActionResult {
  return counted ? { ok: true } : { ok: false, message: "That song has moved on." };
}
