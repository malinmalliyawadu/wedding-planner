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
 * The dance floor's two public actions behind the venue's QR code. They
 * take the code and nothing else: the phone asking is read from its own
 * cookie inside `src/lib/public/mutations.ts`, never from the caller.
 */

export async function requestSong(code: string, song: FloorSongInput): Promise<FloorActionResult> {
  const parsed = parseFloorSong(song);
  if (!parsed) return { ok: false, message: "That song could not be added." };
  return floorRequestResult(await requestDanceSong({ shareCode: code }, parsed));
}

export async function voteOnSong(
  code: string,
  itemId: number,
  kind: "up" | "skip",
  on: boolean,
): Promise<FloorActionResult> {
  if (kind !== "up" && kind !== "skip") return { ok: false, message: "Unknown vote." };
  return floorVoteResult(await voteOnDanceSong({ shareCode: code }, itemId, kind, on === true));
}
