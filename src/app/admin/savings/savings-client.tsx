"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, TrendingUp } from "lucide-react";
import { Slider } from "@/components/slider";
import { Button } from "@/components/ui";
import { formatDateShort } from "@/lib/dates";
import { formatCentsWhole } from "@/lib/money";
import {
  projectCashflow,
  requiredMonthlyContribution,
  type ContributionRecord,
  type PaymentRecord,
} from "@/lib/projection";
import { updateMonthlyContribution } from "../settings/actions";
import { ProjectionChart } from "./projection-chart";

const SLIDER_STEP = 5_000; // $50 notches

export function SavingsClient({
  today,
  weddingDate,
  contributions,
  payments,
  savedMonthlyCents,
  contributionDayOfMonth,
}: {
  today: string;
  weddingDate: string;
  contributions: ContributionRecord[];
  payments: PaymentRecord[];
  savedMonthlyCents: number;
  contributionDayOfMonth: number;
}) {
  const router = useRouter();
  const [monthlyCents, setMonthlyCents] = useState(savedMonthlyCents);
  const [saving, startSaving] = useTransition();

  const base = useMemo(
    () => ({
      today,
      weddingDate,
      contributions,
      payments,
      contributionDayOfMonth,
    }),
    [today, weddingDate, contributions, payments, contributionDayOfMonth],
  );

  const projection = useMemo(
    () => projectCashflow({ ...base, monthlyContributionCents: monthlyCents }),
    [base, monthlyCents],
  );

  const required = useMemo(
    () =>
      requiredMonthlyContribution({ ...base, monthlyContributionCents: 0 }),
    [base],
  );

  const dirty = monthlyCents !== savedMonthlyCents;
  const solvent = projection.firstNegativeDate === null;
  // Give the slider room to reach the required figure and then some.
  const sliderMax =
    Math.ceil(Math.max(required.monthlyCents * 1.5, monthlyCents, 100_000) / SLIDER_STEP) *
    SLIDER_STEP;

  return (
    <>
      {/* The headline: not "will we get there" but "what does it take to
          never be short on the day". */}
      <section className="rounded-lg border border-hairline bg-card p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="eyebrow text-brass">
              Needed every month to never fall short
            </p>
            <p className="figures mt-1 text-5xl leading-none">
              {formatCentsWhole(required.monthlyCents)}
            </p>
            <p className="mt-2 max-w-md text-xs text-ink-soft">
              {required.bindingDate ? (
                <>
                  Set by the payments due on or before{" "}
                  <span className="font-medium text-ink">
                    {formatDateShort(required.bindingDate)}
                  </span>
                  , not by the final total. Saving less clears the bill at the
                  end but bounces that one.
                </>
              ) : (
                <>
                  Everything due is already covered by what you have saved.
                  Anything you add from here is headroom.
                </>
              )}
            </p>
          </div>

          <dl className="flex gap-8 text-right">
            <div>
              <dd className="figures text-lg">
                {formatCentsWhole(projection.openingBalanceCents)}
              </dd>
              <dt className="eyebrow mt-0.5 text-ink-faint">In the pot</dt>
            </div>
            <div>
              <dd className="figures text-lg">
                {formatCentsWhole(projection.outstandingCents)}
              </dd>
              <dt className="eyebrow mt-0.5 text-ink-faint">Still to pay</dt>
            </div>
          </dl>
        </div>

        {required.unreachable.length > 0 && (
          <div className="mt-5 flex items-start gap-3 rounded-md border border-madder/25 bg-madder-tint px-4 py-3 text-xs text-madder">
            <CircleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
            <p>
              No monthly plan can cover{" "}
              {required.unreachable.map((u, i) => (
                <span key={u.date}>
                  {i > 0 && ", "}
                  <span className="font-semibold">
                    {formatDateShort(u.date)}
                  </span>{" "}
                  (short {formatCentsWhole(u.shortfallCents)})
                </span>
              ))}{" "}
              - {required.unreachable.length === 1 ? "it falls" : "they fall"}{" "}
              due before enough contributions land. That needs a lump sum or a
              later due date.
            </p>
          </div>
        )}
      </section>

      {/* The dial, and what it does to the curve. */}
      <section className="mt-6 rounded-lg border border-hairline bg-card p-6 shadow-card">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <label
              htmlFor="monthly"
              className="text-xs font-semibold tracking-wide text-ink-soft"
            >
              Your monthly contribution
            </label>
            <p className="figures mt-1 text-3xl leading-none">
              {formatCentsWhole(monthlyCents)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {monthlyCents !== required.monthlyCents && (
              <button
                onClick={() => setMonthlyCents(required.monthlyCents)}
                className="inline-flex items-center gap-1.5 text-xs text-ink-soft underline-offset-2 hover:text-ink hover:underline"
              >
                <TrendingUp size={13} aria-hidden />
                Use {formatCentsWhole(required.monthlyCents)}
              </button>
            )}
            <Button
              variant="subtle"
              size="sm"
              disabled={!dirty || saving}
              onClick={() =>
                startSaving(async () => {
                  await updateMonthlyContribution(monthlyCents);
                  router.refresh();
                })
              }
            >
              {saving ? "Saving…" : dirty ? "Save as the plan" : "Saved"}
            </Button>
          </div>
        </div>

        <div className="mt-3">
          <Slider
            id="monthly"
            value={Math.min(monthlyCents, sliderMax)}
            max={sliderMax}
            tone={solvent ? "sage" : "rose"}
            valueText={`${formatCentsWhole(monthlyCents)} a month`}
            onChange={(value) =>
              setMonthlyCents(Math.round(value / SLIDER_STEP) * SLIDER_STEP)
            }
          />
        </div>

        {/* The verdict, in words, before the chart. */}
        <div
          className={`mt-4 flex items-start gap-3 rounded-md px-4 py-3 text-sm ${
            solvent
              ? "bg-fern-tint text-fern"
              : "bg-madder-tint text-madder"
          }`}
        >
          {solvent ? (
            <Check size={16} className="mt-0.5 shrink-0" aria-hidden />
          ) : (
            <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
          )}
          <p>
            {solvent ? (
              <>
                At {formatCentsWhole(monthlyCents)} a month the balance never
                goes below zero. It bottoms out at{" "}
                <span className="figures font-medium">
                  {formatCentsWhole(projection.lowestBalanceCents)}
                </span>{" "}
                on {formatDateShort(projection.lowestDate)} and finishes at{" "}
                <span className="figures font-medium">
                  {formatCentsWhole(projection.closingBalanceCents)}
                </span>
                .
              </>
            ) : (
              <>
                At {formatCentsWhole(monthlyCents)} a month you first come up
                short on{" "}
                <span className="font-semibold">
                  {formatDateShort(projection.firstNegativeDate!)}
                </span>
                , and the worst point is{" "}
                <span className="figures font-medium">
                  {formatCentsWhole(projection.lowestBalanceCents)}
                </span>{" "}
                on {formatDateShort(projection.lowestDate)}.
              </>
            )}
          </p>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-hairline bg-card p-6 shadow-card">
        <h2 className="eyebrow text-brass">
          Projected balance to the wedding day
        </h2>
        <div className="mt-4">
          <ProjectionChart
            projection={projection}
            weddingDate={weddingDate}
            today={today}
          />
        </div>
      </section>
    </>
  );
}
