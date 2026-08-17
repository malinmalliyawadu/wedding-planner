"use client";

import { useActionState, useEffect, useState } from "react";
import { Fingerprint, KeyRound } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import { Button, Field, inputClass } from "@/components/ui";
import { idleResult } from "@/lib/action-result";
import { beginSignIn, completeSignIn, signInWithPassword } from "./actions";

/**
 * Signing in.
 *
 * A passkey is the front door and the password is the spare key kept in a
 * drawer, so the passkey gets the button and the password gets a link -
 * until there is no passkey registered, when the order has to reverse or a
 * fresh deployment has nothing to press.
 */
export function SignInForm({
  hasPasskeys,
  next,
}: {
  hasPasskeys: boolean;
  next: string;
}) {
  const [state, formAction, pending] = useActionState(
    signInWithPassword,
    idleResult,
  );
  const [showPassword, setShowPassword] = useState(!hasPasskeys);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeyPending, setPasskeyPending] = useState(false);

  async function signInWithPasskey() {
    setPasskeyError(null);
    setPasskeyPending(true);
    try {
      const options = await beginSignIn();
      const response = await startAuthentication({ optionsJSON: options });
      // On success this redirects, so nothing after it runs.
      const result = await completeSignIn(response, next);
      if (result.status === "error") setPasskeyError(result.message);
    } catch (error) {
      // Cancelling the system prompt lands here and is not a failure worth
      // shouting about - the browser has already closed its own sheet.
      const name = error instanceof Error ? error.name : "";
      setPasskeyError(
        name === "NotAllowedError" || name === "AbortError"
          ? null
          : "That did not work. Try the app password instead.",
      );
    } finally {
      setPasskeyPending(false);
    }
  }

  return (
    <div className="space-y-5">
      {hasPasskeys && (
        <div className="space-y-3">
          <Button
            type="button"
            onClick={signInWithPasskey}
            disabled={passkeyPending}
            className="w-full"
          >
            <Fingerprint size={16} strokeWidth={1.75} aria-hidden />
            {passkeyPending ? "Waiting for your passkey…" : "Sign in with a passkey"}
          </Button>
          {passkeyError && (
            <p role="alert" className="text-sm text-madder">
              {passkeyError}
            </p>
          )}
        </div>
      )}

      {hasPasskeys && !showPassword && (
        <button
          type="button"
          onClick={() => setShowPassword(true)}
          className="mx-auto flex items-center gap-1.5 text-xs text-ink-faint transition-colors duration-150 hover:text-ink"
        >
          <KeyRound size={13} strokeWidth={1.75} aria-hidden />
          Use the app password
        </button>
      )}

      {showPassword && (
        <PasswordFields
          formAction={formAction}
          pending={pending}
          error={state.status === "error" ? state.message : null}
          next={next}
          divided={hasPasskeys}
        />
      )}
    </div>
  );
}

function PasswordFields({
  formAction,
  pending,
  error,
  next,
  divided,
}: {
  formAction: (formData: FormData) => void;
  pending: boolean;
  error: string | null;
  next: string;
  divided: boolean;
}) {
  // Focus the field when it is revealed, but not when it is the page's
  // opening state - grabbing focus on load moves the viewport on a phone.
  const [node, setNode] = useState<HTMLInputElement | null>(null);
  useEffect(() => {
    if (divided) node?.focus();
  }, [divided, node]);

  return (
    <form action={formAction} className="space-y-4">
      {divided && (
        <div className="flex items-center gap-3 pt-1" aria-hidden>
          <span className="h-px flex-1 bg-hairline" />
          <span className="eyebrow text-ink-faint">or</span>
          <span className="h-px flex-1 bg-hairline" />
        </div>
      )}
      <input type="hidden" name="next" value={next} />
      <Field label="App password">
        <input
          ref={setNode}
          type="password"
          name="password"
          autoComplete="current-password"
          className={inputClass}
          required
        />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-madder">
          {error}
        </p>
      )}
      <Button
        type="submit"
        disabled={pending}
        variant={divided ? "subtle" : "primary"}
        className="w-full"
      >
        {pending ? "Checking…" : "Sign in"}
      </Button>
    </form>
  );
}
