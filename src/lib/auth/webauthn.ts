import { headers } from "next/headers";
import { and, asc, eq, gt, lte } from "drizzle-orm";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { db } from "@/db";
import { adminChallenges, adminCredentials } from "@/db/schema";

/**
 * Passkeys for the planner.
 *
 * The verification itself is `@simplewebauthn/server`'s. That is a
 * deliberate dependency rather than a shortcut: doing it by hand means
 * CBOR-decoding authenticator data, converting COSE keys and checking
 * signatures, and the failure mode of getting any of it subtly wrong is a
 * lock that looks shut and is not. This module is the part that is
 * genuinely ours - which domain we are, where challenges live, and what a
 * credential means here.
 */

/** Shown by the authenticator while it asks. */
const RP_NAME = "The Wedding Ledger";

/**
 * The WebAuthn user handle, and a constant on purpose.
 *
 * WebAuthn wants an account to hang credentials off, and this app has one
 * account that both of you share - the planner has no per-person data to
 * own. A passkey here records a device, not a person, so the handle never
 * varies and `admin_credentials.label` carries the only distinction that
 * matters ("Malin's iPhone").
 *
 * It must stay stable. Changing it would make every registered passkey
 * look like it belongs to a different account.
 */
const USER_HANDLE = "wedding-ledger";
const USER_NAME = "wedding-ledger";

/** A challenge is worth this long. Enough for Face ID, not enough to sit on. */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type Passkey = {
  id: number;
  label: string;
  createdAt: Date;
  lastUsedAt: Date | null;
};

/**
 * Which domain we are claiming to be.
 *
 * Derived from the request rather than configured, so the same image works
 * on localhost and on the real domain with no extra variable to get wrong.
 * Behind Traefik the forwarded headers are what carry the truth; `host`
 * alone would be the container.
 *
 * A forged `Host` cannot be used to get in. The browser signs over the
 * origin it is *actually* on, so a mismatch fails verification - the worst
 * a forged header achieves is refusing a legitimate sign-in. `APP_ORIGIN`
 * exists for the setups where the forwarded headers are wrong, because a
 * bad rpID locks you out of the only page that could fix it.
 */
export async function relyingParty(): Promise<{
  rpID: string;
  origin: string;
}> {
  const configured = process.env.APP_ORIGIN;
  if (configured) {
    const url = new URL(configured);
    return { rpID: url.hostname, origin: url.origin };
  }

  const store = await headers();
  const host = store.get("x-forwarded-host") ?? store.get("host") ?? "localhost:3000";
  const proto =
    store.get("x-forwarded-proto")?.split(",")[0].trim() ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");

  // rpID is the bare domain: no scheme, no port. The origin keeps both.
  return { rpID: host.split(":")[0], origin: `${proto}://${host}` };
}

async function issueChallenge(challenge: string): Promise<void> {
  // Swept here rather than on a timer; these are the only rows that would
  // otherwise pile up from abandoned sign-ins.
  await db.delete(adminChallenges).where(lte(adminChallenges.expiresAt, new Date()));
  await db.insert(adminChallenges).values({
    challenge,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  });
}

/**
 * Spend a challenge. Returns whether it was ours and still live, and
 * deletes it either way, so an assertion can be replayed exactly never.
 */
async function consumeChallenge(challenge: string): Promise<boolean> {
  const deleted = await db
    .delete(adminChallenges)
    .where(
      and(
        eq(adminChallenges.challenge, challenge),
        gt(adminChallenges.expiresAt, new Date()),
      ),
    )
    .returning({ challenge: adminChallenges.challenge });
  return deleted.length > 0;
}

/**
 * Ask the browser to make a new passkey.
 *
 * `residentKey: "required"` is what makes it a passkey rather than a
 * second factor: the credential is discoverable, so signing in needs no
 * username and the login page can offer one button.
 *
 * `userVerification: "preferred"` (with verification not *required* below)
 * is the softer of the two settings on purpose. Every real passkey
 * platform does Face ID, Touch ID or a PIN when asked nicely, so in
 * practice you get user verification; what "preferred" buys is that an
 * authenticator which declines it is refused a passkey rather than the
 * couple being locked out of their own wedding.
 */
export async function beginPasskeyRegistration(): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const { rpID } = await relyingParty();
  const existing = await db
    .select({
      credentialId: adminCredentials.credentialId,
      transports: adminCredentials.transports,
    })
    .from(adminCredentials);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: USER_NAME,
    userDisplayName: RP_NAME,
    userID: new TextEncoder().encode(USER_HANDLE),
    attestationType: "none",
    // Offer the ones already registered so a device that holds one
    // declines rather than quietly making a duplicate.
    excludeCredentials: existing.map((row) => ({
      id: row.credentialId,
      transports: parseTransports(row.transports),
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "preferred",
    },
  });

  await issueChallenge(options.challenge);
  return options;
}

export async function finishPasskeyRegistration(
  response: RegistrationResponseJSON,
  label: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { rpID, origin } = await relyingParty();

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: consumeChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      // See the note on `userVerification` above: asked for, not demanded.
      requireUserVerification: false,
    });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "That passkey could not be verified",
    };
  }

  if (!verification.verified) {
    return { ok: false, message: "That passkey could not be verified" };
  }

  const { credential } = verification.registrationInfo;
  await db
    .insert(adminCredentials)
    .values({
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      // The browser knows how this authenticator is reachable; storing it
      // lets a later prompt say "on your phone" instead of guessing.
      transports: response.response.transports?.join(",") ?? null,
      label,
    })
    // Registering a passkey the authenticator already holds is a rename,
    // not a second row.
    .onConflictDoUpdate({
      target: adminCredentials.credentialId,
      set: { label },
    });

  return { ok: true };
}

/**
 * Ask the browser for an assertion from any passkey it holds for us.
 *
 * `allowCredentials` is left empty deliberately: the credentials are
 * discoverable, so the browser shows its own picker and the server never
 * has to be told, or tell anyone, which passkeys exist.
 */
export async function beginPasskeyLogin(): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const { rpID } = await relyingParty();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
  });
  await issueChallenge(options.challenge);
  return options;
}

/**
 * Verify an assertion and say which passkey it was.
 *
 * Returns the row id so the caller can bind the session to it - that link
 * is what makes removing a passkey sign out the browsers that used it.
 */
export async function finishPasskeyLogin(
  response: AuthenticationResponseJSON,
): Promise<
  { ok: true; credentialId: number } | { ok: false; message: string }
> {
  const { rpID, origin } = await relyingParty();

  const [stored] = await db
    .select()
    .from(adminCredentials)
    .where(eq(adminCredentials.credentialId, response.id))
    .limit(1);

  // Deliberately the same message as a failed signature: whether a
  // particular credential id is registered here is not worth telling.
  if (stored === undefined) {
    return { ok: false, message: "That passkey was not recognised" };
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: consumeChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: stored.credentialId,
        publicKey: new Uint8Array(Buffer.from(stored.publicKey, "base64url")),
        counter: stored.counter,
        transports: parseTransports(stored.transports),
      },
      requireUserVerification: false,
    });
  } catch {
    return { ok: false, message: "That passkey was not recognised" };
  }

  if (!verification.verified) {
    return { ok: false, message: "That passkey was not recognised" };
  }

  // The counter is the clone check, and only means anything once the
  // authenticator has started reporting one. `verifyAuthenticationResponse`
  // has already refused a count that went backwards.
  await db
    .update(adminCredentials)
    .set({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    })
    .where(eq(adminCredentials.id, stored.id));

  return { ok: true, credentialId: stored.id };
}

export async function listPasskeys(): Promise<Passkey[]> {
  return db
    .select({
      id: adminCredentials.id,
      label: adminCredentials.label,
      createdAt: adminCredentials.createdAt,
      lastUsedAt: adminCredentials.lastUsedAt,
    })
    .from(adminCredentials)
    .orderBy(asc(adminCredentials.createdAt));
}

export async function renamePasskey(id: number, label: string): Promise<void> {
  await db.update(adminCredentials).set({ label }).where(eq(adminCredentials.id, id));
}

/** Sessions opened with it cascade away with the row. */
export async function deletePasskey(id: number): Promise<void> {
  await db.delete(adminCredentials).where(eq(adminCredentials.id, id));
}

function parseTransports(
  stored: string | null,
): AuthenticatorTransportFuture[] | undefined {
  if (!stored) return undefined;
  const parsed = stored.split(",").filter(Boolean) as AuthenticatorTransportFuture[];
  return parsed.length > 0 ? parsed : undefined;
}
