import { describe, expect, it } from "vitest";
import {
  ceilDiv,
  contributionSchedule,
  daysBetween,
  projectCashflow,
  requiredMonthlyContribution,
  type PaymentRecord,
  type ProjectionInput,
} from "./projection";

function payment(
  id: number,
  dueDate: string,
  dollars: number,
  paidDate: string | null = null,
): PaymentRecord {
  return {
    id,
    label: `Payment ${id}`,
    dueDate,
    amountCents: dollars * 100,
    paidDate,
  };
}

function input(overrides: Partial<ProjectionInput> = {}): ProjectionInput {
  return {
    today: "2026-08-09",
    weddingDate: "2027-03-20",
    contributions: [],
    payments: [],
    monthlyContributionCents: 0,
    contributionDayOfMonth: 1,
    ...overrides,
  };
}

describe("ceilDiv", () => {
  it("rounds up on any remainder", () => {
    expect(ceilDiv(10, 5)).toBe(2);
    expect(ceilDiv(11, 5)).toBe(3);
    expect(ceilDiv(1, 5)).toBe(1);
    expect(ceilDiv(0, 5)).toBe(0);
  });

  it("stays exact for cent amounts that float division would fumble", () => {
    // 0.1 + 0.2 territory: the quotient is not representable exactly.
    expect(ceilDiv(300_000_03, 3)).toBe(100_000_01);
    expect(ceilDiv(700_000_00, 7)).toBe(100_000_00);
    const big = Number.MAX_SAFE_INTEGER - 1;
    expect(ceilDiv(big, 1)).toBe(big);
  });

  it("refuses a non-positive divisor", () => {
    expect(() => ceilDiv(10, 0)).toThrow(/positive divisor/);
  });
});

describe("daysBetween", () => {
  it("counts whole days in both directions", () => {
    expect(daysBetween("2026-08-09", "2026-08-10")).toBe(1);
    expect(daysBetween("2026-08-10", "2026-08-09")).toBe(-1);
    expect(daysBetween("2026-08-09", "2026-08-09")).toBe(0);
  });

  it("crosses month and year boundaries, including a leap day", () => {
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2026-08-09", "2027-03-20")).toBe(223);
  });
});

describe("contributionSchedule", () => {
  it("starts strictly after the given date", () => {
    const dates = contributionSchedule("2026-08-01", "2026-11-01", 1);
    expect(dates).toEqual(["2026-09-01", "2026-10-01", "2026-11-01"]);
  });

  it("includes a date later this month when the day has not passed", () => {
    const dates = contributionSchedule("2026-08-09", "2026-10-20", 20);
    expect(dates).toEqual(["2026-08-20", "2026-09-20", "2026-10-20"]);
  });

  it("clamps a day past the end of a short month", () => {
    const dates = contributionSchedule("2027-01-05", "2027-04-30", 31);
    expect(dates).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
    ]);
  });

  it("clamps to 29 February in a leap year", () => {
    expect(contributionSchedule("2028-02-01", "2028-02-29", 31)).toEqual([
      "2028-02-29",
    ]);
  });

  it("returns nothing when the window is empty or inverted", () => {
    expect(contributionSchedule("2026-08-09", "2026-08-09", 1)).toEqual([]);
    expect(contributionSchedule("2027-01-01", "2026-01-01", 1)).toEqual([]);
  });
});

describe("projectCashflow", () => {
  it("opens with what is banked less what is already paid", () => {
    const projection = projectCashflow(
      input({
        contributions: [
          { date: "2026-01-15", amountCents: 500_000, source: "Savings" },
          { date: "2026-08-01", amountCents: 250_000, source: "Savings" },
        ],
        payments: [payment(1, "2026-05-01", 2_000, "2026-04-28")],
      }),
    );
    expect(projection.openingBalanceCents).toBe(750_000 - 200_000);
  });

  it("ignores contributions dated after today when opening the books", () => {
    const projection = projectCashflow(
      input({
        contributions: [
          { date: "2026-08-01", amountCents: 100_000, source: "Past" },
          { date: "2026-12-01", amountCents: 900_000, source: "Gift to come" },
        ],
      }),
    );
    expect(projection.openingBalanceCents).toBe(100_000);
    // But it does appear later in the run.
    expect(projection.closingBalanceCents).toBe(1_000_000);
    expect(
      projection.events.some((e) => e.label === "Gift to come"),
    ).toBe(true);
  });

  it("applies a contribution before a payment falling on the same day", () => {
    // Exactly one contribution ($1,000 on 1 Sep) against one payment of
    // the same size and date. Paying first would dip below zero.
    const projection = projectCashflow(
      input({
        today: "2026-08-31",
        weddingDate: "2026-09-01",
        monthlyContributionCents: 100_000,
        contributionDayOfMonth: 1,
        payments: [payment(1, "2026-09-01", 1_000)],
      }),
    );
    expect(projection.contributionDates).toEqual(["2026-09-01"]);
    expect(projection.firstNegativeDate).toBeNull();
    expect(projection.lowestBalanceCents).toBe(0);
    expect(projection.closingBalanceCents).toBe(0);
  });

  it("flags the first date the balance goes below zero", () => {
    const projection = projectCashflow(
      input({
        contributions: [
          { date: "2026-08-01", amountCents: 100_000, source: "Savings" },
        ],
        payments: [
          payment(1, "2026-10-01", 500),
          payment(2, "2026-12-01", 2_000),
          payment(3, "2027-01-01", 1_000),
        ],
      }),
    );
    expect(projection.firstNegativeDate).toBe("2026-12-01");
    expect(projection.lowestBalanceCents).toBe(100_000 - 350_000);
    expect(projection.lowestDate).toBe("2027-01-01");
  });

  it("reports no negative date when the plan always covers the bills", () => {
    const projection = projectCashflow(
      input({
        contributions: [
          { date: "2026-08-01", amountCents: 1_000_000, source: "Savings" },
        ],
        monthlyContributionCents: 200_000,
        payments: [payment(1, "2026-10-01", 500)],
      }),
    );
    expect(projection.firstNegativeDate).toBeNull();
    expect(projection.lowestBalanceCents).toBe(1_000_000);
  });

  it("catches an opening balance that is already negative", () => {
    const projection = projectCashflow(
      input({ payments: [payment(1, "2026-01-01", 500, "2026-01-01")] }),
    );
    expect(projection.openingBalanceCents).toBe(-50_000);
    expect(projection.firstNegativeDate).toBe("2026-08-09");
  });

  it("spans today to the wedding date even with no events", () => {
    const projection = projectCashflow(input());
    expect(projection.points[0].date).toBe("2026-08-09");
    expect(projection.points.at(-1)?.date).toBe("2027-03-20");
  });

  it("totals what is outstanding and what the plan will add", () => {
    const projection = projectCashflow(
      input({
        monthlyContributionCents: 250_000,
        payments: [
          payment(1, "2026-09-01", 1_000, "2026-08-30"),
          payment(2, "2026-10-01", 2_000),
          payment(3, "2027-02-01", 3_000),
        ],
      }),
    );
    expect(projection.outstandingCents).toBe(500_000);
    // 1 Sep 2026 through 1 Mar 2027 inclusive: seven contributions.
    expect(projection.contributionDates).toHaveLength(7);
    expect(projection.plannedContributionsCents).toBe(250_000 * 7);
  });

  it("keeps the running balance consistent with the event list", () => {
    const projection = projectCashflow(
      input({
        contributions: [
          { date: "2026-08-01", amountCents: 300_000, source: "Savings" },
        ],
        monthlyContributionCents: 100_000,
        payments: [payment(1, "2026-10-15", 1_500), payment(2, "2027-02-10", 2_500)],
      }),
    );
    const replayed = projection.events.reduce(
      (balance, e) => balance + e.amountCents,
      projection.openingBalanceCents,
    );
    expect(replayed).toBe(projection.closingBalanceCents);
    expect(projection.events.at(-1)?.balanceAfterCents).toBe(
      projection.closingBalanceCents,
    );
  });

  it("does not run past a wedding date already gone", () => {
    const projection = projectCashflow(
      input({ today: "2027-04-01", monthlyContributionCents: 100_000 }),
    );
    expect(projection.contributionDates).toEqual([]);
    expect(projection.points.at(-1)?.date).toBe("2027-04-01");
  });
});

describe("requiredMonthlyContribution", () => {
  it("asks for nothing when the money is already in the bank", () => {
    const result = requiredMonthlyContribution(
      input({
        contributions: [
          { date: "2026-08-01", amountCents: 1_000_000, source: "Savings" },
        ],
        payments: [payment(1, "2026-12-01", 5_000)],
      }),
    );
    expect(result.monthlyCents).toBe(0);
    expect(result.bindingDate).toBeNull();
    expect(result.unreachable).toEqual([]);
  });

  it("solves for the tightest payment date, not the final total", () => {
    // $3,000 due on 1 Oct, two contributions before it (1 Sep, 1 Oct):
    // $1,500 a month. Spreading the same total to the wedding would be
    // far less, and would bounce the October payment.
    const result = requiredMonthlyContribution(
      input({
        payments: [payment(1, "2026-10-01", 3_000)],
      }),
    );
    expect(result.monthlyCents).toBe(150_000);
    expect(result.bindingDate).toBe("2026-10-01");
  });

  it("takes the largest bound across several payment dates", () => {
    const result = requiredMonthlyContribution(
      input({
        payments: [
          payment(1, "2026-10-01", 3_000), // needs 1500/mo over 2
          payment(2, "2027-03-01", 1_000), // cumulative 4000 over 7 -> 572
        ],
      }),
    );
    expect(result.monthlyCents).toBe(150_000);
    expect(result.bindingDate).toBe("2026-10-01");
  });

  it("lets a later payment set the pace when it is the binding one", () => {
    const result = requiredMonthlyContribution(
      input({
        payments: [
          payment(1, "2026-10-01", 100),
          payment(2, "2027-03-01", 14_000),
        ],
      }),
    );
    // $14,100 cumulative over the seven contributions to 1 March.
    expect(result.monthlyCents).toBe(ceilDiv(1_410_000, 7));
    expect(result.bindingDate).toBe("2027-03-01");
  });

  it("rounds up so the answer genuinely covers the payment", () => {
    const result = requiredMonthlyContribution(
      input({ payments: [payment(1, "2026-10-01", 1_000.01)] }),
    );
    // $1000.01 over two contributions is $500.005 -> $500.01.
    expect(result.monthlyCents).toBe(50_001);

    // Feeding it back must clear the payment.
    const projection = projectCashflow(
      input({
        payments: [payment(1, "2026-10-01", 1_000.01)],
        monthlyContributionCents: result.monthlyCents,
      }),
    );
    expect(projection.firstNegativeDate).toBeNull();
  });

  it("credits one-off future contributions before asking for more", () => {
    const withGift = requiredMonthlyContribution(
      input({
        contributions: [
          { date: "2026-09-15", amountCents: 300_000, source: "Gift" },
        ],
        payments: [payment(1, "2026-10-01", 3_000)],
      }),
    );
    expect(withGift.monthlyCents).toBe(0);
  });

  it("names payments no monthly plan can reach", () => {
    const result = requiredMonthlyContribution(
      input({
        today: "2026-08-09",
        contributionDayOfMonth: 28,
        payments: [payment(1, "2026-08-15", 2_000)],
      }),
    );
    expect(result.unreachable).toEqual([
      { date: "2026-08-15", shortfallCents: 200_000 },
    ]);
    expect(result.monthlyCents).toBe(0);
  });

  it("still paces the reachable payments when an early one is unreachable", () => {
    const result = requiredMonthlyContribution(
      input({
        contributionDayOfMonth: 28,
        payments: [
          payment(1, "2026-08-15", 500),
          payment(2, "2026-10-28", 4_500),
        ],
      }),
    );
    expect(result.unreachable).toHaveLength(1);
    // $5,000 cumulative over the three contributions to 28 October.
    expect(result.monthlyCents).toBe(ceilDiv(500_000, 3));
    expect(result.bindingDate).toBe("2026-10-28");
  });

  it("is the smallest figure that works: a cent less goes negative", () => {
    const scenario = input({
      contributions: [
        { date: "2026-08-01", amountCents: 200_000, source: "Savings" },
      ],
      payments: [
        payment(1, "2026-11-01", 4_000),
        payment(2, "2027-02-01", 6_000),
      ],
    });
    const { monthlyCents } = requiredMonthlyContribution(scenario);

    const atRequired = projectCashflow({
      ...scenario,
      monthlyContributionCents: monthlyCents,
    });
    const oneCentShort = projectCashflow({
      ...scenario,
      monthlyContributionCents: monthlyCents - 1,
    });

    expect(atRequired.firstNegativeDate).toBeNull();
    expect(oneCentShort.firstNegativeDate).not.toBeNull();
  });
});
