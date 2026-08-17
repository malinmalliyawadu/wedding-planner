"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import type { ActionResult } from "@/lib/action-result";
import { safeNextPath } from "@/lib/auth/next-path";
import { verifyAppPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";
import { attemptPasswordLogin, forgetFailedLogins } from "@/lib/auth/throttle";
import { beginPasskeyLogin, finishPasskeyLogin } from "@/lib/auth/webauthn";

/**
 * The only actions in the app reachable without being signed in, which is
 * why they are the only ones that count attempts and say as little as they
 * can about why something failed.
 */

/**
 * Who is guessing, for the throttle.
 *
 * Per-source rather than one global counter on purpose: a single bucket
 * would mean a stranger hammering the form could lock the two of you out
 * of your own planner, which turns a brute-force attempt into a denial of
 * service. The cost is that an attacker with many addresses gets a fresh
 * allowance from each - so this is a brake on guessing a password, not a
 * substitute for the password being worth guessing at.
 */
async function attemptKey(): Promise<string> {
  const store = await headers();
  const forwarded = store.get("x-forwarded-for")?.split(",")[0].trim();
  return forwarded || store.get("x-real-ip") || "local";
}

export async function signInWithPassword(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const key = await attemptKey();
  const verdict = attemptPasswordLogin(key);
  if (!verdict.allowed) {
    const minutes = Math.ceil(verdict.retryAfterSeconds / 60);
    return {
      status: "error",
      message: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    };
  }

  const submitted = formData.get("password");
  if (typeof submitted !== "string" || !verifyAppPassword(submitted)) {
    // Says nothing about length, nothing about how close it was, and
    // nothing about whether a password is configured at all.
    return { status: "error", message: "That is not the app password." };
  }

  forgetFailedLogins(key);
  await startSession(null);
  redirect(safeNextPath(formData.get("next")?.toString()));
}

/**
 * Hand the browser a challenge. Public by necessity - the whole point is
 * that the caller is not signed in yet - and safe to be: a challenge is a
 * nonce, it names no credential, and it is worth nothing without an
 * authenticator that already holds a passkey for this domain.
 */
export async function beginSignIn(): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return beginPasskeyLogin();
}

export async function completeSignIn(
  response: AuthenticationResponseJSON,
  next: string,
): Promise<ActionResult> {
  const result = await finishPasskeyLogin(response);
  if (!result.ok) return { status: "error", message: result.message };

  // Bound to the passkey that opened it, so removing that passkey later
  // signs this browser out too.
  await startSession(result.credentialId);
  redirect(safeNextPath(next));
}
