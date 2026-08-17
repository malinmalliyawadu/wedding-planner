"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { Dialog } from "@/components/dialog";
import { Button, Field, inputClass } from "@/components/ui";
import { beginAddPasskey, confirmAddPasskey } from "./actions";

/**
 * Registering a passkey.
 *
 * The name is asked for *before* the system prompt rather than after,
 * because once Face ID has run the credential exists whether or not the
 * couple then type something - and a passkey with no name is one you dare
 * not delete later, since you cannot tell which device it is.
 */
export function AddPasskey({ suggestion }: { suggestion: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(suggestion);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  function start() {
    // Checked on the click rather than on render: a server-rendered button
    // cannot know what the browser can do, and hiding it after hydration
    // would move the page under the cursor.
    if (typeof window !== "undefined" && !window.PublicKeyCredential) {
      setUnsupported(true);
      return;
    }
    setError(null);
    setLabel(suggestion);
    setOpen(true);
  }

  async function register() {
    setError(null);
    setPending(true);
    try {
      const options = await beginAddPasskey();
      const response = await startRegistration({ optionsJSON: options });
      const result = await confirmAddPasskey(response, label);
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "NotAllowedError" || name === "AbortError") {
        // The prompt was dismissed. Nothing went wrong; say nothing.
        setError(null);
      } else if (name === "InvalidStateError") {
        setError("This device already has a passkey for the planner.");
      } else {
        setError(
          error instanceof Error ? error.message : "That did not work.",
        );
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" onClick={start}>
        <Plus size={15} strokeWidth={1.75} aria-hidden />
        Add a passkey
      </Button>

      {unsupported && (
        <p role="alert" className="mt-2 text-xs text-madder">
          This browser cannot make passkeys. Try Safari or Chrome.
        </p>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Add a passkey">
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Your device will ask for Face ID, Touch ID or your screen lock.
            Give it a name first so you can tell it apart from the others
            later.
          </p>
          <Field label="Name" hint="Whose device is it, and which one">
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              className={inputClass}
              autoFocus
              maxLength={60}
            />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-madder">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="subtle"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={register}
              disabled={pending || label.trim() === ""}
            >
              {pending ? "Waiting for your device…" : "Create it"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
