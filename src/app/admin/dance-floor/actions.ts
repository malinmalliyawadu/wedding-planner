"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireAdmin } from "@/lib/auth/session";
import {
  addCoupleSong,
  importReplyCardSongs,
  markOnAir,
  removeOrSkip,
  updateFloor,
} from "@/lib/dj-floor";
import { cleanSongText } from "@/lib/songs";

/**
 * The couple's hands on the dance floor. The guests vote; these overrule.
 */

function done(): ActionResult {
  revalidatePath("/admin/dance-floor");
  return { status: "success" };
}

export async function setFloorOpen(open: boolean): Promise<ActionResult> {
  await requireAdmin();

  await updateFloor({ open: open === true });
  return done();
}

const thresholdSchema = z.object({
  skipVotesNeeded: z.coerce.number().int().min(1, "At least one vote").max(500),
});

export async function setSkipVotesNeeded(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = thresholdSchema.safeParse({ skipVotesNeeded: formData.get("skipVotesNeeded") });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
  await updateFloor({ skipVotesNeeded: parsed.data.skipVotesNeeded });
  return done();
}

/** Skip it if it is on, take it off the list if it is not. */
export async function skipOrRemove(itemId: number): Promise<ActionResult> {
  await requireAdmin();

  await removeOrSkip(itemId);
  return done();
}

export async function setOnAir(itemId: number | null): Promise<ActionResult> {
  await requireAdmin();

  await markOnAir(itemId);
  return done();
}

const songSchema = z.object({
  title: z.string().transform(cleanSongText).pipe(z.string().min(1, "Which song?")),
  artist: z
    .string()
    .transform(cleanSongText)
    .transform((value) => value || null),
});

export async function addSong(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = songSchema.safeParse({
    title: formData.get("title") ?? "",
    artist: formData.get("artist") ?? "",
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
  const outcome = await addCoupleSong(parsed.data);
  if (outcome === "already_queued") {
    return { status: "error", message: "That one is already on the list." };
  }
  return done();
}

export async function importFromReplyCards(): Promise<ActionResult> {
  await requireAdmin();

  await importReplyCardSongs();
  return done();
}
