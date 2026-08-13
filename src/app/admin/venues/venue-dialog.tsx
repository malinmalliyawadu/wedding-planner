"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { DatePicker } from "@/components/date-picker";
import { Dialog } from "@/components/dialog";
import { Select } from "@/components/select";
import { Button, Field, IconButton, inputClass } from "@/components/ui";
import { centsToInput } from "@/lib/money";
import { createVenue, updateVenue } from "./actions";
import { STATUS_LABELS } from "./status";

export type VenueValues = {
  id: number;
  name: string;
  status: keyof typeof STATUS_LABELS;
  locality: string | null;
  address: string | null;
  url: string | null;
  seatedCapacity: number | null;
  standingCapacity: number | null;
  hireFixedCostCents: number;
  perHeadCostCents: number;
  perChildCostCents: number | null;
  minimumSpendCents: number | null;
  dateAvailable: boolean | null;
  travelMinutes: number | null;
  curfew: string | null;
  siteVisitDate: string | null;
  hireIncludes: string | null;
  notes: string | null;
};

/** "23:00:00" is what the column holds; the input wants "23:00". */
function toTimeInput(time: string | null): string {
  return time === null ? "" : time.slice(0, 5);
}

function toCount(n: number | null): string {
  return n === null ? "" : String(n);
}

export function VenueDialog({ venue }: { venue?: VenueValues }) {
  const [open, setOpen] = useState(false);
  const editing = venue !== undefined;

  return (
    <>
      {editing ? (
        <IconButton label={`Edit ${venue.name}`} onClick={() => setOpen(true)}>
          <Pencil size={15} aria-hidden />
        </IconButton>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus size={15} aria-hidden />
          Add venue
        </Button>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${venue.name}` : "Add venue"}
      >
        <ActionForm
          action={editing ? updateVenue : createVenue}
          onSuccess={() => setOpen(false)}
          submitLabel={editing ? "Save changes" : "Add venue"}
        >
          {editing && <input type="hidden" name="id" value={venue.id} />}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name">
              <input
                name="name"
                defaultValue={venue?.name}
                placeholder="e.g. Kōwhai Barn"
                className={inputClass}
                required
                autoFocus
              />
            </Field>
            <Field label="Where you are up to">
              <Select
                name="status"
                defaultValue={venue?.status ?? "considering"}
                options={Object.entries(STATUS_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Town">
              <input
                name="locality"
                defaultValue={venue?.locality ?? ""}
                placeholder="e.g. Matakana"
                className={inputClass}
              />
            </Field>
            <Field label="Travel" hint="Door to door, in minutes">
              <input
                name="travelMinutes"
                type="number"
                min={0}
                max={1440}
                defaultValue={toCount(venue?.travelMinutes ?? null)}
                placeholder="35"
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Address">
            <input
              name="address"
              defaultValue={venue?.address ?? ""}
              className={inputClass}
            />
          </Field>

          <Field label="Website">
            <input
              name="url"
              type="url"
              defaultValue={venue?.url ?? ""}
              placeholder="https://"
              className={inputClass}
            />
          </Field>

          <fieldset className="border-t border-hairline pt-4">
            <legend className="eyebrow text-brass">The room</legend>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Seated" hint="Chairs at tables, for a sit-down meal">
                <input
                  name="seatedCapacity"
                  type="number"
                  min={1}
                  max={2000}
                  defaultValue={toCount(venue?.seatedCapacity ?? null)}
                  placeholder="120"
                  className={inputClass}
                />
              </Field>
              <Field label="Standing">
                <input
                  name="standingCapacity"
                  type="number"
                  min={1}
                  max={5000}
                  defaultValue={toCount(venue?.standingCapacity ?? null)}
                  placeholder="160"
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Our date">
                <Select
                  name="dateAvailable"
                  defaultValue={
                    venue?.dateAvailable === true
                      ? "yes"
                      : venue?.dateAvailable === false
                        ? "no"
                        : "unknown"
                  }
                  options={[
                    { value: "unknown", label: "Not asked yet" },
                    { value: "yes", label: "Free" },
                    { value: "no", label: "Taken" },
                  ]}
                />
              </Field>
              <Field label="Curfew" hint="When the music has to stop">
                <input
                  type="time"
                  name="curfew"
                  defaultValue={toTimeInput(venue?.curfew ?? null)}
                  className={inputClass}
                />
              </Field>
            </div>
          </fieldset>

          <fieldset className="border-t border-hairline pt-4">
            <legend className="eyebrow text-brass">What it costs</legend>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Hire fee" hint="The fixed part, however they bill it">
                <input
                  name="hireFixed"
                  inputMode="decimal"
                  defaultValue={centsToInput(venue?.hireFixedCostCents ?? 0)}
                  placeholder="4500"
                  className={inputClass}
                />
              </Field>
              <Field label="Per adult">
                <input
                  name="perHead"
                  inputMode="decimal"
                  defaultValue={centsToInput(venue?.perHeadCostCents ?? 0)}
                  placeholder="165"
                  className={inputClass}
                />
              </Field>
              <Field label="Per child" hint="Blank charges them as adults">
                <input
                  name="perChild"
                  inputMode="decimal"
                  defaultValue={centsToInput(venue?.perChildCostCents ?? null)}
                  placeholder="80"
                  className={inputClass}
                />
              </Field>
              <Field
                label="Minimum spend"
                hint="Floor on food and drink, not counting the hire fee"
              >
                <input
                  name="minimumSpend"
                  inputMode="decimal"
                  defaultValue={centsToInput(venue?.minimumSpendCents ?? null)}
                  placeholder="No minimum"
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="What the hire fee includes">
                <input
                  name="hireIncludes"
                  defaultValue={venue?.hireIncludes ?? ""}
                  placeholder="e.g. Tables, chairs, marquee, wet-weather room"
                  className={inputClass}
                />
              </Field>
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-3 border-t border-hairline pt-4 sm:grid-cols-2">
            <Field label="Site visit">
              <DatePicker
                name="siteVisitDate"
                defaultValue={venue?.siteVisitDate ?? ""}
                placeholder="Not been yet"
              />
            </Field>
          </div>

          <Field
            label="Notes"
            hint="What it felt like. This is the part no number can hold."
          >
            <textarea
              name="notes"
              rows={3}
              defaultValue={venue?.notes ?? ""}
              className={`${inputClass} resize-y`}
            />
          </Field>
        </ActionForm>
      </Dialog>
    </>
  );
}
