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

## Milestones

M1 foundation (done) → M2 budget & scenarios → M3 savings projection →
M4 seating solver → M5 timeline → M6 run sheet export. Stop at the end of
each milestone and wait for go-ahead.
