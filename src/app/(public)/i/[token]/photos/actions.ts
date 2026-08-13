"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isInviteTokenShape } from "@/lib/invite-token";
import { photosAreOpen, registerPhoto } from "@/lib/public/mutations";
import {
  createUploadTicket,
  describeObject,
  isIssuedKey,
  type UploadTicket,
} from "@/lib/storage";

/**
 * Uploading happens in two steps with the bucket in between.
 *
 * `requestUpload` mints a presigned POST; the browser sends the file
 * straight to object storage, never through this server. `recordUpload`
 * then indexes what landed - and asks the *bucket* what landed, rather
 * than believing the browser, so the row cannot describe a file that
 * does not exist or lie about its size.
 */

export type UploadPermission =
  | { ok: true; ticket: UploadTicket }
  | { ok: false; message: string };

export async function requestUpload(token: string): Promise<UploadPermission> {
  if (!isInviteTokenShape(token) || !(await photosAreOpen(token))) {
    return { ok: false, message: "The album is not open at the moment." };
  }
  try {
    return { ok: true, ticket: await createUploadTicket() };
  } catch {
    // Almost always a deploy with no bucket credentials. Say something a
    // guest can act on, and leave the detail in the server logs.
    return {
      ok: false,
      message: "Photo uploads are not set up yet. Let the couple know.",
    };
  }
}

const recordSchema = z.object({
  storageKey: z.string().refine(isIssuedKey, "That upload did not complete"),
  thumbStorageKey: z
    .string()
    .refine(isIssuedKey, "That upload did not complete"),
  caption: z
    .string()
    .max(280)
    .trim()
    .transform((value) => (value === "" ? null : value)),
  uploaderName: z
    .string()
    .max(80)
    .trim()
    .transform((value) => (value === "" ? null : value)),
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000),
});

export type RecordResult =
  | { ok: true; id: number }
  | { ok: false; message: string };

export async function recordUpload(
  token: string,
  input: {
    storageKey: string;
    thumbStorageKey: string;
    caption: string;
    uploaderName: string;
    width: number;
    height: number;
  },
): Promise<RecordResult> {
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }

  // Both objects, because a row promising a thumbnail that is not there
  // would give the album a grid of broken tiles.
  const [actual, thumb] = await Promise.all([
    describeObject(parsed.data.storageKey),
    describeObject(parsed.data.thumbStorageKey),
  ]);
  if (!actual || !thumb) {
    return { ok: false, message: "That photo did not finish uploading." };
  }

  const id = await registerPhoto(token, {
    storageKey: parsed.data.storageKey,
    thumbStorageKey: parsed.data.thumbStorageKey,
    contentType: actual.contentType,
    byteSize: actual.byteSize,
    width: parsed.data.width,
    height: parsed.data.height,
    caption: parsed.data.caption,
    uploaderName: parsed.data.uploaderName,
  });
  if (id === null) {
    return { ok: false, message: "We could not add that photo." };
  }

  revalidatePath(`/i/${token}/photos`);
  return { ok: true, id };
}
