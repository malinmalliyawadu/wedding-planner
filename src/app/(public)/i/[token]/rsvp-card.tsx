"use client";

import { useActionState, useState } from "react";
import { idleResult } from "@/lib/action-result";
import type { PublicGuest, PublicSongRequest } from "@/lib/public/queries";
import { respondToInvitation } from "./actions";
import { SongPicker } from "./song-picker";
import { WaxSeal } from "./wax-seal";
import { Frame, FrameCorners } from "../../sections";

/**
 * The reply card.
 *
 * Modelled on the small card that comes tucked in with a printed
 * invitation: a name, two boxes to tick - accepts with pleasure,
 * declines with regret - and a line or two to write on. Everyone in the
 * household answers on the one card, because that is how the invitation
 * was addressed and how households actually decide. Each name is a
 * radio pair rather than a checkbox: "not ticked" and "cannot come" are
 * different answers, and a caterer's count depends on the difference.
 *
 * There is no separate confirmation screen. Answering again just moves
 * the same choices, which is what happens when a cousin drops out three
 * weeks later. What changes on success is the seal: the reply is
 * stamped with the couple's mark, which is the card telling you it has
 * been received.
 */
export function RsvpCard({
  token,
  householdName,
  guests,
  message,
  songRequests,
  respondedAt,
  initialA,
  initialB,
}: {
  token: string;
  householdName: string;
  guests: PublicGuest[];
  message: string | null;
  songRequests: PublicSongRequest[];
  respondedAt: string | null;
  initialA: string;
  initialB: string;
}) {
  const [state, formAction, pending] = useActionState(
    respondToInvitation,
    idleResult,
  );

  // Mirrors the radios so the dietary line can appear for whoever is
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

  const saved = state.status === "success";
  const comingCount = Object.values(attending).filter(Boolean).length;

  return (
    <div className="relative isolate bg-card px-6 py-10 shadow-card sm:px-14 sm:py-14">
      <Frame />
      <FrameCorners />

      {guests.length === 0 ? (
        <p className="text-center text-[1rem] leading-relaxed text-ink-soft">
          We do not have anyone listed under {householdName} yet. Give us a
          nudge and we will sort it out.
        </p>
      ) : (
        <form action={formAction} className="space-y-10">
          <input type="hidden" name="token" value={token} />

          <div className="space-y-8">
            {guests.map((guest) => {
              const isComing = attending[guest.id];
              return (
                <fieldset key={guest.id} className="border-t border-hairline pt-6 first:border-t-0 first:pt-0">
                  <legend className="sr-only">
                    Will {guest.firstName} {guest.lastName} be coming?
                  </legend>

                  <p aria-hidden className="font-display text-[1.35rem] text-ink">
                    {guest.firstName} {guest.lastName}
                  </p>

                  <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:gap-10">
                    {[
                      { value: "yes", label: "Accepts with pleasure" },
                      { value: "no", label: "Declines with regret" },
                    ].map((choice) => (
                      <div key={choice.value} className="flex">
                        <input
                          type="radio"
                          id={`attending-${guest.id}-${choice.value}`}
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
                        <label
                          htmlFor={`attending-${guest.id}-${choice.value}`}
                          className="reply-choice formula text-[1.15rem]"
                        >
                          <span className="reply-box" aria-hidden />
                          {choice.label}
                        </label>
                      </div>
                    ))}
                  </div>

                  {/* Only asked of people who are actually eating. */}
                  {isComing && (
                    <label className="mt-3 block animate-fade">
                      <span className="eyebrow block text-ink-faint">
                        Anything the kitchen should know
                      </span>
                      <input
                        type="text"
                        name={`diet-${guest.id}`}
                        defaultValue={guest.dietaryNotes ?? ""}
                        maxLength={300}
                        placeholder="Allergies, vegetarian, gluten free…"
                        className="field-line"
                      />
                    </label>
                  )}
                </fieldset>
              );
            })}
          </div>

          <div className="space-y-8 border-t border-hairline pt-8">
            <SongPicker token={token} initial={songRequests} />

            <label className="block">
              <span className="eyebrow block text-ink-faint">A note for us</span>
              <textarea
                name="message"
                defaultValue={message ?? ""}
                maxLength={1000}
                rows={2}
                className="field-line resize-none"
              />
            </label>
          </div>

          {state.status === "error" && (
            <p role="alert" className="text-center text-sm text-madder">
              {state.message}
            </p>
          )}

          <div className="flex flex-col items-center gap-4">
            {saved ? (
              <div role="status" className="flex flex-col items-center text-center">
                {/* The reply, sealed. The couple's mark on the card is
                    what says it has been received; the words underneath
                    only agree with it. */}
                <div className="size-20 animate-rise">
                  <WaxSeal initialA={initialA} initialB={initialB} idPrefix="reply" />
                </div>
                <p className="mt-3 font-display text-lg text-ink">
                  {comingCount > 0 ? "Wonderful. Your reply is in." : "Thank you for letting us know."}
                </p>
                <p className="mt-1 text-sm text-ink-faint">
                  {comingCount > 0
                    ? "Change it any time from this page."
                    : "You will be missed."}
                </p>
              </div>
            ) : (
              <button
                type="submit"
                disabled={pending}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-10 text-[0.8125rem] font-semibold tracking-caps text-paper uppercase transition-colors duration-150 hover:bg-spine-raised disabled:pointer-events-none disabled:opacity-45 sm:w-auto"
              >
                {pending ? "Sending…" : respondedAt ? "Update our reply" : "Send our reply"}
              </button>
            )}
            {respondedAt && !saved && (
              <p className="text-xs text-ink-faint">
                You have already replied. Changing anything here replaces it.
              </p>
            )}
            {saved && (
              <button
                type="submit"
                disabled={pending}
                className="text-xs text-ink-faint underline decoration-hairline-strong underline-offset-4 transition-colors hover:text-ink"
              >
                Send it again with changes
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
