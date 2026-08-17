"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { photos } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { requireAdmin } from "@/lib/auth/session";

/**
 * Moderation is a hide, never a delete.
 *
 * Somebody's photograph of the day is not the couple's to destroy on a
 * mis-tap. Hidden takes it off the album, off the wall and out of the
 * serving route immediately, and leaves both the row and the object
 * where they are - so it can come back.
 */
export async function setPhotoHidden(
  id: number,
  hidden: boolean,
): Promise<ActionResult> {
  await requireAdmin();

  await db.update(photos).set({ hidden }).where(eq(photos.id, id));
  revalidatePath("/admin/photos");
  // The wall sits outside admin/ so a projector gets no sidebar.
  revalidatePath("/wall");
  return { status: "success" };
}
