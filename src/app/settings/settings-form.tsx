"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { Button, Field, inputClass } from "@/components/ui";
import { idleResult } from "@/lib/action-result";
import { centsToInput } from "@/lib/money";
import type { Settings } from "@/lib/queries";
import { updateSettings } from "./actions";

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, formAction, pending] = useActionState(
    updateSettings,
    idleResult,
  );

  return (
    <form action={formAction} className="space-y-5">
      <fieldset className="space-y-4">
        <legend className="eyebrow mb-3 text-brass">The two of you</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" hint="Side A, shown in sage">
            <input
              name="partnerAName"
              defaultValue={settings.partnerAName}
              className={inputClass}
              required
            />
          </Field>
          <Field label="Name" hint="Side B, shown in rose">
            <input
              name="partnerBName"
              defaultValue={settings.partnerBName}
              className={inputClass}
              required
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-hairline pt-5">
        <legend className="eyebrow mb-3 text-brass">The day</legend>
        <Field
          label="Wedding date"
          hint="Everything counts backwards from here"
        >
          <input
            type="date"
            name="weddingDate"
            defaultValue={settings.weddingDate ?? ""}
            className={inputClass}
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-4 border-t border-hairline pt-5">
        <legend className="eyebrow mb-3 text-brass">Saving</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Monthly contribution" hint="What you put aside">
            <input
              name="monthlyContribution"
              inputMode="decimal"
              defaultValue={centsToInput(settings.monthlyContributionCents)}
              className={inputClass}
            />
          </Field>
          <Field
            label="Day of the month"
            hint="Short months fall back to the last day"
          >
            <input
              type="number"
              name="contributionDayOfMonth"
              min={1}
              max={31}
              defaultValue={settings.contributionDayOfMonth}
              className={inputClass}
              required
            />
          </Field>
        </div>
      </fieldset>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-madder">
          {state.message}
        </p>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-hairline pt-5">
        {state.status === "success" && (
          <span
            aria-live="polite"
            className="inline-flex items-center gap-1.5 text-xs text-fern"
          >
            <Check size={14} aria-hidden />
            Saved
          </span>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
