@AGENTS.md

# The Wedding Ledger

Private wedding planning app for exactly two users (partner A and partner B).
No auth code anywhere: the app runs behind Traefik basicauth on self-hosted
infra (Vultr + Coolify). Every request is assumed authorised. No user
accounts, no sessions, no public surface.

The reason this app exists is budget scenario modelling (M2) and the savings
projection (M3). Everything else is supporting structure.

## Stack

- Next.js (App Router) + TypeScript, `output: "standalone"`
- Postgres 17 via Drizzle ORM; SQL migrations checked in under `drizzle/`
- Tailwind v4 (design tokens in `src/app/globals.css` under `@theme`)
- Vitest for unit tests (`src/**/*.test.ts`)
- pnpm; deployed as a Docker container on Coolify

## Commands

- `docker compose up -d` - local dev Postgres (port 5433)
- `pnpm dev` - dev server
- `pnpm db:generate` - generate migration from schema changes (never push/sync)
- `pnpm db:migrate` - apply migrations
- `pnpm db:seed` - wipe + reseed the realistic fake wedding
- `pnpm test` - unit tests

## Hard rules

- All money is integer NZD cents everywhere (DB, calculations, intermediate
  values). Format only at the render boundary via `src/lib/money.ts`.
- Every schema change is a migration file (`pnpm db:generate`), committed.
- Budget maths and the seating solver get unit tests. UI does not.
- Currency NZD; dates Pacific/Auckland. Calendar dates are stored as plain
  `date` columns and formatted in UTC (see `src/lib/dates.ts`); Auckland
  only matters when computing "today".
- Non-goals (do not build or scaffold): RSVP collection, guest logins, any
  public page, wedding website, vendor directory, place cards, user
  accounts, email sending, mobile apps.

## Decisions made

- **Per-head costs and age brackets**: `per_head_cost_cents` charges adults;
  `per_child_cost_cents` overrides for children when non-null (null =
  children charged as adults); infants are always free. Scenarios store
  `adult_count` + `child_count` (not one guest_count) so this stays correct.
- **Scenario semantics**: a scenario includes every budget item at base cost
  by default. A `scenario_choices` row overrides: either picks a tier
  (`item_option_id`) or excludes the item (`excluded = true`).
- **Settings singleton**: one-row `settings` table (id always 1) holds
  partner names, wedding date, planned monthly contribution. Partner names
  drive the side A/B labels and the duogram mark.
- **CSV import format** (header required):
  `household,first_name,last_name,side,age_bracket,dietary_notes`.
  Households matched by name case-insensitively, created when missing.
  Existing first+last names are skipped, so re-import is idempotent.
- **rsvp_status**: pending / attending / declined.
- **Migrations in prod**: the Docker entrypoint runs a bundled `migrate.js`
  (esbuild output of `src/db/migrate.ts`) before starting the server.
- **The dev DB** listens on 5433 to avoid clashing with any local Postgres.

## Budget maths (M2)

`src/lib/budget.ts` is the single source of truth for what the wedding
costs and is the most heavily tested module in the repo. It is pure: no
DB, no React, integer cents only. Anything that needs a number asks it.

- `computeLine` / `computeBudget` - fixed + perAdult x adults +
  perChild x children, per item, with tier overrides and exclusions.
- `marginalAdultCents` / `marginalChildCents` - what one more guest costs
  across the whole budget. This is the number that decides the B-list.
- `tierStops` / `activeTierIndex` - the stops for an item's tier slider.
  Base costs only get their own stop when no tier reproduces them.
- `compromiseOrder` - combined priority ascending, then cost descending;
  already-cut lines sink to the bottom. `isContested` flags a priority
  gap of 2 or more. `cumulativeSavings` gives the running "cut to here".
- `compareBudgets` - per-line deltas against the first scenario given.

The modeller (`/budget`) holds guest counts and tier choices in client
state and recomputes on every change, so nothing round-trips to the
server until you save a scenario. `/budget/scenarios` compares two or
three; `/budget/compromise` ranks the cuts. Scenario selection is in the
URL (`?s=`) on both, so a view can be shared between the two of you.

Budget item and tier CRUD was not in the M2 brief but is included: the
budget table is unmaintainable without it. Scenario choices store only
overrides - an item at base costs has no row.

## Savings projection (M3)

`src/lib/projection.ts` is the second pure, heavily tested module. The
question it answers is *not* "will we have saved enough by the wedding" -
it is "is the balance ever negative on a day a payment falls due".

- `projectCashflow` walks today → wedding date event by event and returns
  the balance curve, the first negative date, the low point and totals.
  Opening balance = contributions banked less payments already settled.
- `requiredMonthlyContribution` solves for the smallest monthly amount
  that keeps every payment date solvent. At each due date the money
  available is opening + one-offs + M x (contributions landed by then),
  which gives a lower bound on M; the answer is the largest bound. A
  naive total/months figure is wrong and will bounce an early payment.
  Payments falling due before any contribution lands are reported in
  `unreachable` - no monthly plan fixes those, only a lump sum.
- **Convention**: a contribution and a payment on the same date apply
  contribution first. Money in on the 1st covers a bill due the 1st.
- `ceilDiv` is exact: `Math.ceil(a / b)` can land the wrong side of an
  integer, so the quotient is corrected with integer multiplication.

The savings page recomputes client-side as the contribution slider moves;
"Save as the plan" persists it to settings. Payments and contributions
get CRUD here (again not in the brief, but the projection is frozen
without them), plus a paid/unpaid toggle.

### The projection chart

Inline SVG in `src/app/savings/projection-chart.tsx` - no chart library,
which keeps it self-contained and on-palette. It is a **step** line: the
balance is flat between events and jumps on each one, which is what
actually happens. Positive and negative regions are split exactly at zero
with two clipPaths rather than by interpolating a crossing point.

Colour is `--color-plot-positive` / `--color-plot-negative`, a validated
diverging pair (see the note in `globals.css`). Do not swap in the softer
UI greens - they fail the chroma floor and read as gray as marks. Meaning
never rests on colour alone: position against a labelled zero line is the
primary encoding, with hatching on the overdrawn region and a direct
"Short from <date>" label reinforcing it.

## Design language ("engraved stationery meets ledger")

- Single deliberate light theme; no dark mode.
- Tokens live in `globals.css`: paper/card surfaces, evergreen ink, brass
  accent, hairlines; the sidebar is the dark "spine".
- Side A is sage, side B is rose, threaded through chips, the duogram and
  (later) priorities and task ownership. Semantic green = fern, red = madder.
- Type: Marcellus (display), Figtree (UI), IBM Plex Mono for all money and
  counts (`.figures` utility). Small-caps eyebrows use `.eyebrow`, double
  hairline header rules use `.rule-double`.
- UI primitives in `src/components/ui.tsx`; forms post to server actions via
  `ActionForm` (returns `ActionResult`), dialogs use native `<dialog>`.
- Sliders use the shared `<Slider>` (`src/components/slider.tsx`) and the
  `.slider` utility. The input is deliberately much taller than its
  hairline track so it stays easy to grab; `--fill` paints the travelled
  part. Never hand-roll a range input.
- `PriorityBars` renders the two of you as stacked sage/rose five-step
  bars - the visual shorthand for agreement and disagreement.

## Milestones

M1 foundation (done) → M2 budget & scenarios (done) → M3 savings
projection (done) → M4 seating solver → M5 timeline → M6 run sheet
export. Stop at the end of each milestone and wait for go-ahead.

The couple are Ru (side A, sage) and Malin (side B, rose); names live in
the `settings` row and drive every side label in the UI. Edit them, the
wedding date and the savings plan at `/settings` (gear in the sidebar
footer).
