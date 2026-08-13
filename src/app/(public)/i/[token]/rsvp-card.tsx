"use client";

import { PartyPopper } from "lucide-react";
import { useActionState, useState } from "react";
import { idleResult } from "@/lib/action-result";
import type { PublicGuest } from "@/lib/public/queries";
import { respondToInvitation } from "./actions";
import { Panel } from "../../sections";

/**
 * The reply card.
 *
 * Everyone in the household answers on one card, because that is how the
 * invitation was addressed and how households actually decide. Each name
 * is a radio group rather than a checkbox: "not ticked" and "cannot come"
 * are different answers, and a caterer's count depends on the difference.
 *
 * There is no separate confirmation screen. Answering again just moves
 * the same choices, which is what happens when a cousin drops out three
 * weeks later.
 */
export function RsvpCard({
  token,
  householdName,
  guests,
  message,
  songRequest,
  respondedAt,
}: {
  token: string;
  householdName: string;
  guests: PublicGuest[];
  message: string | null;
  songRequest: string | null;
  respondedAt: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    respondToInvitation,
    idleResult,
  );

  // Mirrors the radios so the dietary field can appear for whoever is
  // coming. Seeded from what is already saved, so reopening the card
  // shows the household their existing answer rather than a blank one.
  const [attending, setAttending] = useState<Record<number, boolean | null>>(
    () =>
      Object.fromEntries(
        guests.map((guest) => [
          guest.id,
          guest.rsvpStatus === "pending" ? null : guest.rsvpStatus === "attending",
        ]),
      ),
  );

  if (guests.length === 0) {
    return (
      <Panel className="text-center">
        <p className="text-sm text-ink-soft">
          We do not have anyone listed under {householdName} yet. Give us a
          nudge and we will sort it out.
        </p>
      </Panel>
    );
  }

  const saved = state.status === "success";
  const comingCount = Object.values(attending).filter(Boolean).length;

  return (
    <Panel>
      {saved && (
        <p
          role="status"
          className="mb-6 flex items-center gap-2 rounded-md bg-fern-tint px-4 py-3 text-sm text-fern"
        >
          <PartyPopper className="size-4 shrink-0" aria-hidden />
          {comingCount > 0
            ? "Wonderful - your reply is in. Change it any time from this page."
            : "Thank you for letting us know. You will be missed."}
        </p>
      )}

      <form action={formAction} className="space-y-8">
        <input type="hidden" name="token" value={token} />

        {guests.map((guest) => {
          const isComing = attending[guest.id];
          return (
            <fieldset key={guest.id} className="border-t border-hairline pt-5">
              <legend className="sr-only">
                Will {guest.firstName} {guest.lastName} be coming?
              </legend>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p
                  aria-hidden
                  className="font-display text-lg text-ink"
                >
                  {guest.firstName} {guest.lastName}
                </p>

                <div className="flex gap-2">
                  {[
                    { value: "yes", label: "Coming" },
                    { value: "no", label: "Can't make it" },
                  ].map((choice) => (
                    <label
                      key={choice.value}
                      className="flex-1 sm:flex-initial"
                    >
                      <input
                        type="radio"
                        name={`attending-${guest.id}`}
                        value={choice.value}
                        required
                        defaultChecked={
                          isComing !== null && isComing === (choice.value === "yes")
                        }
                        onChange={() =>
                          setAttending((current) => ({
                            ...current,
                            [guest.id]: choice.value === "yes",
                          }))
                        }
                        className="peer sr-only"
                      />
                      {/* The filled state is the whole signal - a tick as
                          well would be saying it twice. */}
                      <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-hairline-strong px-4 text-sm whitespace-nowrap text-ink-soft transition-colors duration-150 select-none peer-checked:border-transparent peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brass hover:border-ink-faint">
                        {choice.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Only asked of people who are actually eating. */}
              {isComing && (
                <label className="mt-4 block animate-fade">
                  <span className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-soft">
                    Anything the kitchen should know?
                  </span>
                  <input
                    type="text"
                    name={`diet-${guest.id}`}
                    defaultValue={guest.dietaryNotes ?? ""}
                    maxLength={300}
                    placeholder="Allergies, vegetarian, gluten free…"
                    className="w-full rounded-md border border-hairline-strong bg-white px-3 py-2 text-sm text-ink transition-colors duration-150 placeholder:text-ink-faint focus:border-brass focus:outline-none pointer-coarse:min-h-11 pointer-coarse:text-base"
                  />
                </label>
              )}
            </fieldset>
          );
        })}

        <div className="space-y-5 border-t border-hairline pt-6">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-soft">
              A song that will get you dancing
            </span>
            <input
              type="text"
              name="songRequest"
              defaultValue={songRequest ?? ""}
              maxLength={200}
              placeholder="Artist - title"
              className="w-full rounded-md border border-hairline-strong bg-white px-3 py-2 text-sm text-ink transition-colors duration-150 placeholder:text-ink-faint focus:border-brass focus:outline-none pointer-coarse:min-h-11 pointer-coarse:text-base"
            />
            <span className="mt-1 block text-xs text-ink-faint">
              We are handing the list straight to the band.
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-soft">
              A note for us
            </span>
            <textarea
              name="message"
              defaultValue={message ?? ""}
              maxLength={1000}
              rows={3}
              className="w-full rounded-md border border-hairline-strong bg-white px-3 py-2 text-sm text-ink transition-colors duration-150 placeholder:text-ink-faint focus:border-brass focus:outline-none pointer-coarse:text-base"
            />
          </label>
        </div>

        {state.status === "error" && (
          <p role="alert" className="text-sm text-madder">
            {state.message}
          </p>
        )}

        <div className="flex flex-col items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-ink px-8 text-sm font-medium text-paper transition-colors duration-150 hover:bg-spine-raised disabled:pointer-events-none disabled:opacity-45 sm:w-auto"
          >
            {pending
              ? "Sending…"
              : respondedAt || saved
                ? "Update our reply"
                : "Send our reply"}
          </button>
          {respondedAt && !saved && (
            <p className="text-xs text-ink-faint">
              You have already replied. Changing anything here replaces it.
            </p>
          )}
        </div>
      </form>
    </Panel>
  );
}
