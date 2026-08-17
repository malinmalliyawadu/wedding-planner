import { Fingerprint, KeyRound, Laptop } from "lucide-react";
import { DeleteButton } from "@/components/delete-button";
import { Button, Chip, EmptyState, PageHeader } from "@/components/ui";
import { isPasswordConfigured } from "@/lib/auth/password";
import { currentSession, listSessions, requireAdmin } from "@/lib/auth/session";
import { listPasskeys } from "@/lib/auth/webauthn";
import { formatMomentNZ } from "@/lib/dates";
import { AddPasskey } from "./add-passkey";
import { RenamePasskey } from "./rename-passkey";
import { forgetPasskey, revokeSession, signOutEverywhere } from "./actions";

export const dynamic = "force-dynamic";

/**
 * How the two of you get in.
 *
 * A passkey each, on each device, and the app password behind them as the
 * way back if a phone goes in a lake. The password is not manageable from
 * here on purpose: it lives in the environment, so changing it is a
 * redeploy rather than a form - which is also what keeps a stolen session
 * from being able to change the credential that outlives it.
 */
export default async function AccessPage() {
  await requireAdmin();

  const [passkeys, sessions, thisSession] = await Promise.all([
    listPasskeys(),
    listSessions(),
    currentSession(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Getting in"
        title="Access"
        actions={<AddPasskey suggestion={suggestDeviceName()} />}
      >
        <p className="mt-3 max-w-2xl text-sm text-ink-soft">
          A passkey is your face or your fingerprint on a device you already
          carry - nothing to remember and nothing to type. Add one for each
          device the two of you plan on. The app password stays as the way
          back in if you lose them all.
        </p>
      </PageHeader>

      <div className="space-y-8">
        <section>
          <h2 className="eyebrow mb-3 text-brass">Passkeys</h2>
          {passkeys.length === 0 ? (
            <EmptyState
              title="No passkeys yet"
              hint="Add one and you will not have to type the app password again on this device."
            />
          ) : (
            <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-card shadow-card">
              {passkeys.map((passkey) => (
                <li
                  key={passkey.id}
                  // `group` is what `.row-actions` hangs off: without it
                  // the rename and remove buttons never fade in.
                  className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5"
                >
                  <Fingerprint
                    size={17}
                    strokeWidth={1.75}
                    className="shrink-0 text-ink-faint"
                    aria-hidden
                  />
                  {/*
                   * The min-width is what makes the row wrap tidily on a
                   * phone: below it the chip drops to its own line instead
                   * of squeezing the dates into three ragged ones.
                   */}
                  <div className="min-w-48 flex-1">
                    <p className="truncate text-sm font-medium">
                      {passkey.label}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      Added {formatMomentNZ(passkey.createdAt)}
                      {passkey.lastUsedAt === null
                        ? " · never used"
                        : ` · last used ${formatMomentNZ(passkey.lastUsedAt)}`}
                    </p>
                  </div>
                  {thisSession?.credential?.id === passkey.id && (
                    // Not "this device": the label beside it is often
                    // exactly that, and the same words twice in one row
                    // read as a mistake. This says what it means - the
                    // passkey you are signed in with right now.
                    <Chip tone="fern">In use here</Chip>
                  )}
                  <div className="row-actions flex items-center gap-1">
                    <RenamePasskey id={passkey.id} label={passkey.label} />
                    <DeleteButton
                      label={`Remove ${passkey.label}`}
                      action={forgetPasskey.bind(null, passkey.id)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {passkeys.length > 0 && (
            <p className="mt-2.5 text-xs text-ink-faint">
              Removing a passkey also signs out the browsers that used it.
            </p>
          )}
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <h2 className="eyebrow text-brass">Signed in</h2>
            {sessions.length > 1 && (
              <form action={signOutEverywhere}>
                <Button type="submit" variant="subtle" size="sm">
                  Sign out everywhere
                </Button>
              </form>
            )}
          </div>
          <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-card shadow-card">
            {sessions.map((session) => {
              const isThisOne = session.id === thisSession?.id;
              return (
                <li
                  key={session.id}
                  className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5"
                >
                  <Laptop
                    size={17}
                    strokeWidth={1.75}
                    className="shrink-0 text-ink-faint"
                    aria-hidden
                  />
                  {/*
                   * The min-width is what makes the row wrap tidily on a
                   * phone: below it the chip drops to its own line instead
                   * of squeezing the dates into three ragged ones.
                   */}
                  <div className="min-w-48 flex-1">
                    <p className="truncate text-sm">
                      {describeBrowser(session.userAgent)}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {session.credential === null
                        ? "App password"
                        : session.credential.label}
                      {" · in since "}
                      {formatMomentNZ(session.createdAt)}
                      {" · until "}
                      {formatMomentNZ(session.expiresAt)}
                    </p>
                  </div>
                  {isThisOne ? (
                    <Chip tone="fern">This browser</Chip>
                  ) : (
                    <div className="row-actions">
                      <DeleteButton
                        label="Sign this one out"
                        action={revokeSession.bind(null, session.id)}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-lg border border-hairline bg-card p-5 shadow-card sm:p-6">
          <h2 className="flex items-center gap-2 font-display text-lg">
            <KeyRound
              size={17}
              strokeWidth={1.75}
              className="text-ink-faint"
              aria-hidden
            />
            The app password
          </h2>
          {isPasswordConfigured() ? (
            <p className="mt-2 max-w-2xl text-sm text-ink-soft">
              Set, and it stays as the fallback. It lives in{" "}
              <code className="figures text-xs text-brass">APP_PASSWORD</code>{" "}
              in the app&rsquo;s environment, so changing it is a redeploy -
              which is deliberate. A browser someone else is holding cannot
              change the credential that would lock them out.
            </p>
          ) : (
            <p className="mt-2 max-w-2xl text-sm text-madder">
              Not set. Every passkey here still works, but if you lose all of
              them there is no way back in. Set{" "}
              <code className="figures text-xs">APP_PASSWORD</code> in the
              app&rsquo;s environment.
            </p>
          )}
          <p className="mt-3 max-w-2xl text-xs text-ink-faint">
            The calendar subscription is the one thing a passkey cannot open -
            a calendar client can only carry a password. It takes the app
            password in the URL; see the Timeline page.
          </p>
        </section>
      </div>
    </>
  );
}

/**
 * A first guess at the name, so the common case is one tap and no typing.
 * Deliberately vague - the browser will not say which iPhone, and a wrong
 * confident guess is worse than an obvious placeholder.
 */
function suggestDeviceName(): string {
  return "This device";
}

/**
 * Turn a user-agent string into something worth reading.
 *
 * User agents lie and this does not try to be clever about it - it looks
 * for the handful of names that distinguish the couple's own devices from
 * each other, which is all this list is for.
 */
function describeBrowser(userAgent: string | null): string {
  if (userAgent === null) return "Unknown browser";

  const platform = /iPhone/.test(userAgent)
    ? "iPhone"
    : /iPad/.test(userAgent)
      ? "iPad"
      : /Android/.test(userAgent)
        ? "Android"
        : /Mac OS X/.test(userAgent)
          ? "Mac"
          : /Windows/.test(userAgent)
            ? "Windows"
            : /Linux/.test(userAgent)
              ? "Linux"
              : null;

  // Order matters: every one of these also says "Safari" or "Chrome".
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : null;

  if (platform === null && browser === null) return "Unknown browser";
  return [browser, platform].filter(Boolean).join(" on ");
}
