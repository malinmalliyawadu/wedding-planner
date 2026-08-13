"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { isInviteTokenShape } from "@/lib/invite-token";
import { submitRsvp, type RsvpAnswer } from "@/lib/public/mutations";

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
  songRequest: optionalText(200, "That song title"),
});

export async function respondToInvitation(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = submissionSchema.safeParse({
    token: formData.get("token") ?? "",
    message: formData.get("message") ?? "",
    songRequest: formData.get("songRequest") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
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
    songRequest: parsed.data.songRequest,
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
