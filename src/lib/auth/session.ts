import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq, gt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminCredentials, adminSessions } from "@/db/schema";

/**
 * Signed-in state for the planner.
 *
 * The cookie holds an opaque random token and nothing else - no signed
 * payload, no expiry the holder can read, no claims. Every check is a row
 * lookup, which is what makes "remove this passkey" and "sign out
 * everywhere" take effect on the next request rather than whenever a
 * token happens to expire. A database round trip per request is a price
 * this app can pay: every page is already `force-dynamic` and there are
 * two people using it.
 *
 * The check itself lives in `src/proxy.ts`, one gate in front of
 * everything private, so a new page is protected by existing rather than
 * by someone remembering to guard it. `requireAdmin` here is the second
 * lock and the way a page gets hold of the session it is running under.
 */

export const SESSION_COOKIE = "wedding_session";

/**
 * 30 days, absolute, never extended.
 *
 * Sliding expiry would mean writing to the database on requests that only
 * read, and re-issuing the cookie from places that are not allowed to set
 * one. Signing in again once a month is a single tap on a passkey.
 */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type AdminSession = {
  id: number;
  createdAt: Date;
  expiresAt: Date;
  userAgent: string | null;
  /** The passkey used, or null when the app password was. */
  credential: { id: number; label: string } | null;
};

/** 256 bits. The whole of the credential, so it is worth that much. */
function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * What goes in the database. The token itself never does: backups leave
 * this machine, and a column of live session tokens should not.
 *
 * A plain SHA-256 is right here where it would be wrong for a password.
 * The input is 256 bits of `randomBytes`, so there is no dictionary to
 * run against it and nothing for a work factor to slow down.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

/**
 * Look a token up. Used by the proxy, which has a `NextRequest` rather
 * than the `cookies()` store, so the token is a parameter.
 */
export async function findSession(
  token: string | undefined,
): Promise<AdminSession | null> {
  if (!token) return null;

  const [row] = await db
    .select({
      id: adminSessions.id,
      createdAt: adminSessions.createdAt,
      expiresAt: adminSessions.expiresAt,
      userAgent: adminSessions.userAgent,
      credentialId: adminCredentials.id,
      credentialLabel: adminCredentials.label,
    })
    .from(adminSessions)
    .leftJoin(
      adminCredentials,
      eq(adminSessions.credentialId, adminCredentials.id),
    )
    .where(
      and(
        eq(adminSessions.tokenHash, hashToken(token)),
        // Expiry is enforced here as well as swept below, so a session is
        // dead the moment it is due even if nothing has cleaned up.
        gt(adminSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (row === undefined) return null;

  return {
    id: row.id,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    userAgent: row.userAgent,
    credential:
      row.credentialId === null
        ? null
        : { id: row.credentialId, label: row.credentialLabel ?? "Passkey" },
  };
}

/**
 * The session this request is running under, or null.
 *
 * `cache` memoises it for the render pass, so a layout and the page inside
 * it share one lookup.
 */
export const currentSession = cache(async (): Promise<AdminSession | null> => {
  const store = await cookies();
  return findSession(store.get(SESSION_COOKIE)?.value);
});

/**
 * Insist on a session, or send the visitor to sign in.
 *
 * The proxy has already turned away anyone without one, so reaching the
 * redirect means the two disagree - a route the proxy does not cover, or a
 * session that expired between the gate and the render. Either way the
 * answer is the same and the page renders nothing.
 */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await currentSession();
  if (session === null) redirect("/login");
  return session;
}

/** Sign in: mint a token, record the session, set the cookie. */
export async function startSession(
  credentialId: number | null,
): Promise<void> {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  // Opportunistic sweep. Sessions are the only rows here that accumulate
  // without anyone looking at them, and signing in is the natural moment.
  await db.delete(adminSessions).where(lte(adminSessions.expiresAt, new Date()));

  await db.insert(adminSessions).values({
    tokenHash: hashToken(token),
    credentialId,
    userAgent: (await headers()).get("user-agent")?.slice(0, 300) ?? null,
    expiresAt,
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Not `secure` in development, or the browser refuses to keep it on
    // http://localhost and the login appears to silently fail.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Sign out this browser. */
export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(adminSessions).where(eq(adminSessions.tokenHash, hashToken(token)));
  }
  store.delete(SESSION_COOKIE);
}

/** Sign out every browser, including this one. For a lost laptop. */
export async function endAllSessions(): Promise<void> {
  await db.delete(adminSessions);
  (await cookies()).delete(SESSION_COOKIE);
}

/** Revoke one session by id, from the access page's list. */
export async function endSessionById(id: number): Promise<void> {
  await db.delete(adminSessions).where(eq(adminSessions.id, id));
}

/** Every live session, newest first, for the access page. */
export async function listSessions(): Promise<AdminSession[]> {
  const rows = await db
    .select({
      id: adminSessions.id,
      createdAt: adminSessions.createdAt,
      expiresAt: adminSessions.expiresAt,
      userAgent: adminSessions.userAgent,
      credentialId: adminCredentials.id,
      credentialLabel: adminCredentials.label,
    })
    .from(adminSessions)
    .leftJoin(
      adminCredentials,
      eq(adminSessions.credentialId, adminCredentials.id),
    )
    .where(gt(adminSessions.expiresAt, new Date()))
    .orderBy(desc(adminSessions.createdAt));

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    userAgent: row.userAgent,
    credential:
      row.credentialId === null
        ? null
        : { id: row.credentialId, label: row.credentialLabel ?? "Passkey" },
  }));
}

/** How many passkeys exist, which decides what the login page offers. */
export async function countPasskeys(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(adminCredentials);
  return row?.n ?? 0;
}
