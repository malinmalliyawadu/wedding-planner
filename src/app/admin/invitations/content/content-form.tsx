"use client";

import { useActionState } from "react";
import { DatePicker } from "@/components/date-picker";
import { Field, inputClass } from "@/components/ui";
import { Button } from "@/components/ui";
import { idleResult } from "@/lib/action-result";
import { updateSiteContent } from "../actions";

export type SiteContentValues = {
  welcomeMessage: string | null;
  venueName: string | null;
  venueAddress: string | null;
  venueMapUrl: string | null;
  arrivalTime: string | null;
  ceremonyTime: string | null;
  dressCode: string | null;
  giftNote: string | null;
  travelNotes: string | null;
  accommodationNotes: string | null;
  rsvpDeadline: string | null;
  photosEnabled: boolean;
  tableRevealEnabled: boolean;
};

/**
 * Everything the invitation says, in the couple's own words.
 *
 * The prose fields are textareas rather than anything richer on purpose:
 * the invitation renders them with `whitespace: pre-line`, so what they
 * type is what appears, paragraph breaks and all, and there is no markup
 * to learn or to escape.
 */
export function ContentForm({ values }: { values: SiteContentValues }) {
  const [state, formAction, pending] = useActionState(
    updateSiteContent,
    idleResult,
  );

  return (
    <form action={formAction} className="space-y-8">
      <section className="space-y-4">
        <h2 className="font-display text-lg text-ink">The day</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Venue name">
            <input
              name="venueName"
              defaultValue={values.venueName ?? ""}
              className={inputClass}
              placeholder="Te Awa Paddock"
            />
          </Field>
          <Field label="Address">
            <input
              name="venueAddress"
              defaultValue={values.venueAddress ?? ""}
              className={inputClass}
              placeholder="482 Hamurana Road, Rotorua"
            />
          </Field>
          <Field
            label="Map link"
            hint="Guests tap this instead of retyping the address."
          >
            <input
              name="venueMapUrl"
              type="url"
              defaultValue={values.venueMapUrl ?? ""}
              className={inputClass}
              placeholder="https://maps.google.com/?q=…"
            />
          </Field>
          <Field label="What to wear">
            <input
              name="dressCode"
              defaultValue={values.dressCode ?? ""}
              className={inputClass}
              placeholder="Garden formal"
            />
          </Field>
          <Field label="Guests arrive" hint="24-hour, like 13:30.">
            <input
              name="arrivalTime"
              defaultValue={values.arrivalTime?.slice(0, 5) ?? ""}
              className={inputClass}
              placeholder="13:30"
              inputMode="numeric"
            />
          </Field>
          <Field label="Ceremony starts">
            <input
              name="ceremonyTime"
              defaultValue={values.ceremonyTime?.slice(0, 5) ?? ""}
              className={inputClass}
              placeholder="14:00"
              inputMode="numeric"
            />
          </Field>
          <Field label="Reply by">
            {/* defaultValue, not value: passing `value` without an
                onChange makes the picker controlled and unmovable. */}
            <DatePicker
              name="rsvpDeadline"
              defaultValue={values.rsvpDeadline ?? ""}
            />
          </Field>
        </div>
      </section>

      <section className="space-y-4 border-t border-hairline pt-8">
        <h2 className="font-display text-lg text-ink">In your words</h2>
        <Field
          label="Welcome message"
          hint="Sits under the names on the opened card."
        >
          <textarea
            name="welcomeMessage"
            defaultValue={values.welcomeMessage ?? ""}
            rows={3}
            className={inputClass}
          />
        </Field>
        <Field label="Getting there">
          <textarea
            name="travelNotes"
            defaultValue={values.travelNotes ?? ""}
            rows={5}
            className={inputClass}
            placeholder="Parking, taxis, how long the drive takes…"
          />
        </Field>
        <Field label="Staying the night">
          <textarea
            name="accommodationNotes"
            defaultValue={values.accommodationNotes ?? ""}
            rows={5}
            className={inputClass}
            placeholder="Room blocks, nearby places, cabins on site…"
          />
        </Field>
        <Field
          label="Gifts"
          hint="Only guests holding a link can read this, which is what makes it a reasonable place for bank details."
        >
          <textarea
            name="giftNote"
            defaultValue={values.giftNote ?? ""}
            rows={4}
            className={inputClass}
          />
        </Field>
      </section>

      <section className="space-y-3 border-t border-hairline pt-8">
        <h2 className="font-display text-lg text-ink">Switches</h2>
        {[
          {
            name: "photosEnabled",
            checked: values.photosEnabled,
            label: "Shared photo album",
            hint: "Lets guests upload and see everyone else's photographs.",
          },
          {
            name: "tableRevealEnabled",
            checked: values.tableRevealEnabled,
            label: "Show people their table",
            hint: "Leave this off until the seating plan is final - a table number people memorise and then have to unlearn causes more trouble than it saves.",
          },
        ].map((toggle) => (
          <label
            key={toggle.name}
            className="flex cursor-pointer items-start gap-3 rounded-md border border-hairline bg-card p-4"
          >
            <input
              type="checkbox"
              name={toggle.name}
              defaultChecked={toggle.checked}
              className="mt-0.5 size-4 shrink-0"
            />
            <span>
              <span className="block text-sm font-medium text-ink">
                {toggle.label}
              </span>
              <span className="mt-0.5 block text-xs text-ink-faint">
                {toggle.hint}
              </span>
            </span>
          </label>
        ))}
      </section>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-madder">
          {state.message}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-hairline pt-6">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state.status === "success" && (
          <span role="status" className="text-sm text-fern">
            Saved.
          </span>
        )}
      </div>
    </form>
  );
}
