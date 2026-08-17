"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { ActionResult } from "@/lib/action-result";
import {
  endAllSessions,
  endSession,
  endSessionById,
  requireAdmin,
} from "@/lib/auth/session";
import {
  beginPasskeyRegistration,
  deletePasskey,
  finishPasskeyRegistration,
  renamePasskey,
} from "@/lib/auth/webauthn";

/**
 * Managing the way in.
 *
 * Every one of these checks the session first, like every other planner
 * action - see `actions-guarded.test.ts` for why that is the guard that
 * matters rather than the proxy. It is worth saying twice here: these are
 * the actions that hand out and take away credentials, so an unguarded one
 * would not be a leak, it would be a spare key.
 */

const labelSchema = z
  .string()
  .trim()
  .min(1, "Give it a name so you can tell your devices apart")
  .max(60, "That name is too long");

export async function beginAddPasskey(): Promise<PublicKeyCredentialCreationOptionsJSON> {
  await requireAdmin();

  return beginPasskeyRegistration();
}

export async function confirmAddPasskey(
  response: RegistrationResponseJSON,
  label: string,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = labelSchema.safeParse(label);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }

  const result = await finishPasskeyRegistration(response, parsed.data);
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/admin/access");
  return { status: "success" };
}

export async function setPasskeyLabel(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const parsed = labelSchema.safeParse(formData.get("label"));
  if (!Number.isInteger(id)) {
    return { status: "error", message: "That passkey no longer exists" };
  }
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }

  await renamePasskey(id, parsed.data);
  revalidatePath("/admin/access");
  return { status: "success" };
}

/**
 * Remove a passkey. Sessions opened with it go too, by the foreign key -
 * which is the point: revoking a lost phone is one action, not two.
 */
export async function forgetPasskey(id: number): Promise<void> {
  await requireAdmin();

  await deletePasskey(id);
  revalidatePath("/admin/access");
}

export async function revokeSession(id: number): Promise<void> {
  await requireAdmin();

  await endSessionById(id);
  revalidatePath("/admin/access");
}

export async function signOut(): Promise<void> {
  await requireAdmin();

  await endSession();
  redirect("/login");
}

/** For a laptop left on a train. Takes this browser with it. */
export async function signOutEverywhere(): Promise<void> {
  await requireAdmin();

  await endAllSessions();
  redirect("/login");
}
