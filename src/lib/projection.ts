/**
 * Savings projection. Pure functions, integer NZD cents throughout.
 *
 * The question this module answers is not "will we have saved enough by
 * the wedding" - it is "is the balance ever negative on a day a payment
 * falls due". Those are different questions, and only the second one
 * bounces a payment.
 *
 * Convention: when a contribution and a payment land on the same date,
 * the contribution is applied first. Money in on the 1st covers a bill
 * due on the 1st.
 */

import {
  compareISO,
  daysInMonth,
  formatISO,
  parseISO,
} from "./iso-date";

export { compareISO, daysBetween } from "./iso-date";

export type ContributionRecord = {
  date: string;
  amountCents: number;
  source: string;
};

export type PaymentRecord = {
  id: number;
  label: string;
  dueDate: string;
  amountCents: number;
  paidDate: string | null;
};

export type ProjectionInput = {
  /** Today, as an ISO date in Pacific/Auckland. */
  today: string;
  weddingDate: string;
  contributions: ContributionRecord[];
  payments: PaymentRecord[];
  monthlyContributionCents: number;
  /** 1-31; clamped to the last day of shorter months. */
  contributionDayOfMonth: number;
};

export type ProjectionEvent = {
  date: string;
  kind: "contribution" | "payment";
  label: string;
  /** Positive in, negative out. */
  amountCents: number;
  balanceAfterCents: number;
};

export type Projection = {
  /** Banked contributions less payments already settled. */
  openingBalanceCents: number;
  events: ProjectionEvent[];
  /** Balance over time, including both endpoints, for plotting. */
  points: Array<{ date: string; balanceCents: number }>;
  closingBalanceCents: number;
  lowestBalanceCents: number;
  lowestDate: string;
  /** The first day the balance goes below zero, if it ever does. */
  firstNegativeDate: string | null;
  /** Still to pay between today and the wedding. */
  outstandingCents: number;
  /** What the current monthly plan will add over the same window. */
  plannedContributionsCents: number;
  contributionDates: string[];
};

export type RequiredContribution = {
  /** The smallest monthly amount that keeps every reachable date solvent. */
  monthlyCents: number;
  /** The payment date that forces that figure. */
  bindingDate: string | null;
  /**
   * Dates no monthly plan can rescue: they fall due before enough
   * contributions land, so they need a lump sum instead.
   */
  unreachable: Array<{ date: string; shortfallCents: number }>;
};

/* ------------------------------------------------------------------ dates */

/**
 * The monthly contribution dates strictly after `after`, up to and
 * including `until`. A day-of-month past the end of a short month lands
 * on that month's last day.
 */
export function contributionSchedule(
  after: string,
  until: string,
  dayOfMonth: number,
): string[] {
  if (compareISO(after, until) >= 0) return [];
  const day = Math.min(Math.max(Math.trunc(dayOfMonth), 1), 31);

  const start = parseISO(after);
  const dates: string[] = [];
  let year = start.year;
  let month = start.month;

  // Walk months from the current one; the guard below drops any date that
  // is not strictly after `after`.
  for (let i = 0; i < 600; i++) {
    const candidate = formatISO({
      year,
      month,
      day: Math.min(day, daysInMonth(year, month)),
    });
    if (compareISO(candidate, until) > 0) break;
    if (compareISO(candidate, after) > 0) dates.push(candidate);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return dates;
}

/* -------------------------------------------------------------- projection */

/**
 * Exact ceiling division for non-negative integers. `Math.ceil(a / b)`
 * can land on the wrong side when the quotient is very close to an
 * integer, so the result is corrected with integer multiplication.
 */
export function ceilDiv(numerator: number, divisor: number): number {
  if (divisor <= 0) throw new Error("ceilDiv needs a positive divisor");
  const q = Math.floor(numerator / divisor);
  return q * divisor < numerator ? q + 1 : q;
}

export function projectCashflow(input: ProjectionInput): Projection {
  const {
    today,
    weddingDate,
    contributions,
    payments,
    monthlyContributionCents,
    contributionDayOfMonth,
  } = input;

  // Everything banked and everything already paid is history.
  const banked = contributions
    .filter((c) => compareISO(c.date, today) <= 0)
    .reduce((sum, c) => sum + c.amountCents, 0);
  const settled = payments
    .filter((p) => p.paidDate !== null)
    .reduce((sum, p) => sum + p.amountCents, 0);
  const openingBalanceCents = banked - settled;

  const horizonEnd =
    compareISO(weddingDate, today) > 0 ? weddingDate : today;

  const contributionDates = contributionSchedule(
    today,
    horizonEnd,
    contributionDayOfMonth,
  );

  const scheduled: ProjectionEvent[] = [
    // One-off contributions someone has already recorded in the future.
    ...contributions
      .filter((c) => compareISO(c.date, today) > 0)
      .map((c) => ({
        date: c.date,
        kind: "contribution" as const,
        label: c.source,
        amountCents: c.amountCents,
        balanceAfterCents: 0,
      })),
    ...contributionDates.map((date) => ({
      date,
      kind: "contribution" as const,
      label: "Monthly saving",
      amountCents: monthlyContributionCents,
      balanceAfterCents: 0,
    })),
    ...payments
      .filter((p) => p.paidDate === null)
      .map((p) => ({
        date: p.dueDate,
        kind: "payment" as const,
        label: p.label,
        amountCents: -p.amountCents,
        balanceAfterCents: 0,
      })),
  ].sort((a, b) => {
    const byDate = compareISO(a.date, b.date);
    if (byDate !== 0) return byDate;
    // Money in before money out on the same day.
    return a.kind === b.kind ? 0 : a.kind === "contribution" ? -1 : 1;
  });

  let balance = openingBalanceCents;
  let lowestBalanceCents = openingBalanceCents;
  let lowestDate = today;
  let firstNegativeDate: string | null =
    openingBalanceCents < 0 ? today : null;

  const events: ProjectionEvent[] = [];
  const points: Array<{ date: string; balanceCents: number }> = [
    { date: today, balanceCents: openingBalanceCents },
  ];

  for (const event of scheduled) {
    balance += event.amountCents;
    events.push({ ...event, balanceAfterCents: balance });
    points.push({ date: event.date, balanceCents: balance });

    if (balance < lowestBalanceCents) {
      lowestBalanceCents = balance;
      lowestDate = event.date;
    }
    if (balance < 0 && firstNegativeDate === null) {
      firstNegativeDate = event.date;
    }
  }

  // Always close the series on the wedding date so the chart spans the
  // full window even when the last event is earlier.
  const lastPoint = points[points.length - 1];
  if (lastPoint.date !== horizonEnd) {
    points.push({ date: horizonEnd, balanceCents: balance });
  }

  return {
    openingBalanceCents,
    events,
    points,
    closingBalanceCents: balance,
    lowestBalanceCents,
    lowestDate,
    firstNegativeDate,
    outstandingCents: payments
      .filter((p) => p.paidDate === null)
      .reduce((sum, p) => sum + p.amountCents, 0),
    plannedContributionsCents:
      monthlyContributionCents * contributionDates.length,
    contributionDates,
  };
}

/**
 * The smallest monthly contribution that keeps the balance non-negative
 * on every date a payment falls due - not merely enough to reach the
 * total by the wedding day.
 *
 * At each payment date d the money available is the opening balance plus
 * any one-off contributions landing by d plus M for every scheduled
 * contribution by d. Requiring that to cover everything due by d gives a
 * lower bound on M; the answer is the largest of those bounds.
 */
export function requiredMonthlyContribution(
  input: ProjectionInput,
): RequiredContribution {
  const { today, weddingDate, contributions, payments, contributionDayOfMonth } =
    input;

  const banked = contributions
    .filter((c) => compareISO(c.date, today) <= 0)
    .reduce((sum, c) => sum + c.amountCents, 0);
  const settled = payments
    .filter((p) => p.paidDate !== null)
    .reduce((sum, p) => sum + p.amountCents, 0);
  const opening = banked - settled;

  const horizonEnd = compareISO(weddingDate, today) > 0 ? weddingDate : today;
  const contributionDates = contributionSchedule(
    today,
    horizonEnd,
    contributionDayOfMonth,
  );
  const futureOneOffs = contributions.filter(
    (c) => compareISO(c.date, today) > 0,
  );

  const due = payments
    .filter((p) => p.paidDate === null)
    .sort((a, b) => compareISO(a.dueDate, b.dueDate));

  let monthlyCents = 0;
  let bindingDate: string | null = null;
  const unreachable: Array<{ date: string; shortfallCents: number }> = [];

  let cumulativeDue = 0;
  for (const payment of due) {
    cumulativeDue += payment.amountCents;

    const oneOffsByThen = futureOneOffs
      .filter((c) => compareISO(c.date, payment.dueDate) <= 0)
      .reduce((sum, c) => sum + c.amountCents, 0);
    const contributionsByThen = contributionDates.filter(
      (d) => compareISO(d, payment.dueDate) <= 0,
    ).length;

    const shortfall = cumulativeDue - opening - oneOffsByThen;
    if (shortfall <= 0) continue;

    if (contributionsByThen === 0) {
      unreachable.push({ date: payment.dueDate, shortfallCents: shortfall });
      continue;
    }

    const needed = ceilDiv(shortfall, contributionsByThen);
    if (needed > monthlyCents) {
      monthlyCents = needed;
      bindingDate = payment.dueDate;
    }
  }

  return { monthlyCents, bindingDate, unreachable };
}
