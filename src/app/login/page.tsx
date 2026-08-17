import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/next-path";
import { isPasswordConfigured } from "@/lib/auth/password";
import { countPasskeys, currentSession } from "@/lib/auth/session";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in - The Wedding Ledger",
  /* The planner's front door is not for indexing any more than the rest of it. */
  robots: { index: false, follow: false },
};

/**
 * The planner's own front door.
 *
 * Deliberately says nothing: not the couple's names, not the date, not
 * whether a password is set. It is the one private-side page a stranger
 * can load, so it is the one page that has to be uninteresting. That is
 * also why it lives here rather than under `(public)` - it reads the
 * session and credential tables, which nothing in that folder may touch.
 */
export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  // Already signed in: nobody wants a login form they do not need.
  if ((await currentSession()) !== null) redirect("/admin");

  const { next } = await searchParams;
  const target = safeNextPath(typeof next === "string" ? next : null);
  const [passkeys, passwordReady] = [
    await countPasskeys(),
    isPasswordConfigured(),
  ];

  return (
    <main className="grain relative flex min-h-dvh items-center justify-center bg-paper px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <p className="eyebrow text-brass">Planning</p>
          <h1 className="mt-2 font-display text-3xl leading-tight">
            The Wedding Ledger
          </h1>
          <div className="mx-auto mt-4 max-w-24 rule-double pb-1" />
        </div>

        <div className="rounded-lg border border-hairline bg-card p-6 shadow-card">
          {passkeys === 0 && !passwordReady ? (
            <NotConfigured />
          ) : (
            <SignInForm hasPasskeys={passkeys > 0} next={target} />
          )}
        </div>

        {passkeys === 0 && passwordReady && (
          <p className="mx-auto mt-5 max-w-xs text-center text-xs text-ink-faint">
            Sign in with the app password, then add a passkey so you do not
            have to type it again.
          </p>
        )}
      </div>
    </main>
  );
}

/**
 * No password set and no passkey registered, which means nobody can get in
 * at all. Says so plainly rather than showing a form that cannot work -
 * the same courtesy the album pays when object storage is not set up.
 *
 * It names the variable but never hints at a value, so this is safe to
 * show a stranger: they learn the app is unconfigured, which the blank
 * planner behind it would have told them anyway.
 */
function NotConfigured() {
  return (
    <div className="space-y-3 text-sm">
      <p className="font-display text-lg text-ink">No way in yet</p>
      <p className="text-ink-soft">
        Set <code className="figures text-xs text-brass">APP_PASSWORD</code> in
        the app&rsquo;s environment and redeploy. That is the credential you
        sign in with the first time; once you are in, add a passkey on the
        Access page and the password becomes the fallback.
      </p>
      <p className="text-ink-faint">See DEPLOYMENT.md, step 5.</p>
    </div>
  );
}
