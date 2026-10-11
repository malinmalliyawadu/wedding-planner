"use server";

import { requestDanceSong, voteOnDanceSong } from "@/lib/public/mutations";
import {
  floorRequestResult,
  floorVoteResult,
  parseFloorSong,
  type FloorActionResult,
  type FloorSongInput,
} from "../../../_dance-floor/action-results";

/**
 * The dance floor's two public actions behind an invitation link. Both
 * take the token and nothing that names a household:
 * `src/lib/public/mutations.ts` re-resolves who is asking from the token,
 * as every public write does.
 */

export async function requestSong(token: string, song: FloorSongInput): Promise<FloorActionResult> {
  const parsed = parseFloorSong(song);
  if (!parsed) return { ok: false, message: "That song could not be added." };
  return floorRequestResult(await requestDanceSong({ token }, parsed));
}

export async function voteOnSong(
  token: string,
  itemId: number,
  kind: "up" | "skip",
  on: boolean,
): Promise<FloorActionResult> {
  if (kind !== "up" && kind !== "skip") return { ok: false, message: "Unknown vote." };
  return floorVoteResult(await voteOnDanceSong({ token }, itemId, kind, on === true));
}
