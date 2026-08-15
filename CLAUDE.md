@AGENTS.md

# The Wedding Ledger

Wedding planning app for exactly two users (partner A and partner B), plus
a public invitation for their guests.

**Two audiences, one deployment, and the split is structural:**

- `src/app/admin/` - the planner, at `/admin/*`. Behind Traefik
  basicauth, may read anything, no authentication code of its own.
  `src/app/wall/` is also private but sits outside the group so a
  projector gets no sidebar.
- `src/app/(public)/` - everything a stranger can load: the landing page
  at `/` and the invitations at `/i/*`. **Served with no basicauth in
  front of it.** Reaches the database only through `src/lib/public/`,
  and `no-private-imports.test.ts` reads that exact folder to enforce it.

Keeping the public surface in one folder is what makes that test
exhaustive rather than a list somebody has to remember to extend. A new
public page belongs in `(public)`, and in `isPublicPath` in `proxy.ts` -
which `proxy.test.ts` pins from both directions.

The reason this app exists is budget scenario modelling (M2) and the savings
projection (M3). Everything else is supporting structure.

## Stack

- Next.js (App Router) + TypeScript, `output: "standalone"`
- Postgres 17 via Drizzle ORM; SQL migrations checked in under `drizzle/`
- Tailwind v4 (design tokens in `src/app/globals.css` under `@theme`)
- Vitest for unit tests (`src/**/*.test.ts`)
- pnpm; deployed as a Docker container on Coolify

## Deployment

See `DEPLOYMENT.md`. Coolify builds the Dockerfile straight from GitHub -
no CI pipeline, no registry, because nothing here needs build-time
secrets. The only runtime variable is `DATABASE_URL`.

**The app has no authentication at all.** Traefik basicauth in front of
it is the only thing between the internet and the guest list, addresses
and budget - *except* `/` and `/i/*`, which are deliberately exempt so
guests can reach the landing page and their invitation. Any change
touching routing, domains or middleware needs both halves verified
afterwards: `/admin/guests` must return `401`, and `/` and
`/i/<a real token>` must return `200`. A carve-out that matches too much
publishes everything - note the Traefik rule needs ``Path(`/`)``, never
``PathPrefix(`/`)``, which would match the entire domain.

`src/proxy.ts` is the second lock: the public Traefik router stamps a
header, and the app 404s any stamped request that did not land on a
public route. That covers the case a path rule is most likely to get
wrong - `/i/../admin/guests` matches `PathPrefix(/i)` going in and
resolves to `/admin/guests` coming out.

`/_next/image` must never be made public. The optimiser fetches any
same-origin path it is handed, so opening it would serve every private
route that returns an image; the album ships its own thumbnails, made on
the guest's phone, precisely so it can stay shut.

Guest photographs live in S3-compatible object storage, not Postgres, so
**the database is no longer the whole backup surface** - the bucket is
the other half. Without the `S3_*` variables every other feature still
works and the album says it is not configured.

`/api/health` does a real `select 1`, so it reports whether the app can
actually work rather than merely that the process is alive. Coolify
probes it from inside Docker, bypassing basicauth.

Note `src/db/index.ts` deliberately does **not** guard on
`DATABASE_URL`: that module is evaluated during `next build`, which has
no database. The guard lives in `migrate.ts`, which the container runs
before the server.

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
- **Nothing under `src/app/(public)/` may import `@/db`, `@/db/schema`,
  `@/lib/queries` or `drizzle-orm`.** All of it goes through
  `src/lib/public/`, where the readable columns are written down in one
  place. `no-private-imports.test.ts` fails the build otherwise.
- Non-goals (do not build or scaffold): guest logins or accounts, a
  public page outside `(public)`, a vendor directory, place cards, email
  sending, mobile apps.

## Decisions made

- **Per-head costs and age brackets**: `per_head_cost_cents` charges adults;
  `per_child_cost_cents` overrides for children when non-null (null =
  children charged as adults); infants are always free. Scenarios store
  `adult_count` + `child_count` (not one guest_count) so this stays correct.
- **Scenario semantics**: a scenario includes every budget item at base cost
  by default. A `scenario_choices` row overrides: either picks a tier
  (`item_option_id`) or excludes the item (`excluded = true`).
- **Settings singleton**: one-row `settings` table (id always 1) holds
  partner names, wedding date, planned monthly contribution and the
  assumed outside-caterer rate. Partner names drive the side A/B labels
  and the duogram mark.
- **Guest CSV import format** (header required):
  `household,first_name,last_name,side,age_bracket,dietary_notes`.
  Households matched by name case-insensitively, created when missing.
  Existing first+last names are skipped, so re-import is idempotent.
- **Venue CSV import** (`src/lib/venue-csv.ts`) works the other way round:
  headers are matched by alias, because a shortlist arrives as somebody's
  research spreadsheet and reshaping it by hand is where the errors get
  in. See the M8 section.
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

The modeller (`/admin/budget`) holds guest counts and tier choices in client
state and recomputes on every change, so nothing round-trips to the
server until you save a scenario. `/admin/budget/scenarios` compares two or
three; `/admin/budget/compromise` ranks the cuts. Scenario selection is in the
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

Inline SVG in `src/app/admin/savings/projection-chart.tsx` - no chart library,
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

## Seating solver (M4)

`src/lib/seating.ts`. The objective function, which is the whole design:

```
cost =  2000 x (guests left without a seat)
     +  1000 x (seats each table is over capacity, summed)
     +    Σ    the weight of every violated constraint
     +     3 x (extra tables each household spills into)
```

- Constraints are binary: `together` breaks when the pair sit apart,
  `apart` breaks when they sit together, costing the weight (1-10). That
  is what makes weights mean something - one broken "absolutely not"
  outranks five broken "would be nice", so the soft rules go first.
- Capacity is **soft but expensive**, not forbidden. At 1000 a seat it
  dominates any realistic pile of weights, but keeping it soft lets the
  annealer pass through infeasible states instead of getting stuck. When
  the seats genuinely do not exist it overfills rather than stranding
  someone (2000 > 1000) and reports it.
- The **household term is an addition to the brief**, adjustable in the
  UI and settable to 0. Without it, few constraints over many guests
  leaves the objective nearly unconstrained and families get scattered.
- Simulated annealing with a seeded PRNG (`mulberry32`) so runs are
  reproducible and testable. `scoreAssignment` is the reference cost;
  `SolverState` tracks the same number incrementally (only the tables,
  household and constraints a move touches). A test pins the two
  together - if you change the objective, change **both**.
- Pinned guests are excluded from the movable set entirely. A pin wins
  even when it forces a constraint to break, and the report says so.
- Seats attending, non-infant guests. Infants sit on laps, consistent
  with the budget treating them as free.

A real run is ~40ms for a wedding-sized problem, so it runs in the
browser on demand; "Save arrangement" persists seats and pins together.
Constraints naming someone who is not being seated are filtered out
before they reach the solver - they can be neither met nor broken.

`buildReport` is the "never silently produce a bad arrangement" half:
violations with both names and both tables, sorted loudest first, plus
over-capacity tables, unseated guests and split households.

## Timeline and calendar (M5)

`src/lib/timeline.ts` holds `TIMELINE_TEMPLATE`: every task defined by
how long *before* the wedding it wants doing, so the whole plan falls out
of one date. `generateTimeline` dates it backwards and **skips titles
that already exist**, so the button is safe to press again after you have
edited things - it fills gaps and never touches what is already there.

**No jurisdiction-specific legal deadline is encoded anywhere.** The
marriage licence carries a placeholder date, `needsConfirmation`, and a
note saying to look up the real rule. Tests assert the template mentions
no country, no "N days", no fee and no registry wording - if you extend
the template, keep it that way.

Because the wedding is usually nearer than the longest lead time, freshly
generated plans legitimately land tasks in the past. They show as Overdue
rather than being clamped to today: "you are behind on this" is true and
useful, "do this now" would not be.

`src/lib/ics.ts` writes the subscribable feed served at
`/admin/timeline/tasks.ics`. The two things that quietly break real calendar
clients are both handled and both tested: **line folding at 75 octets**
(bytes, not characters - a single macron shifts the boundary, and a fold
must never split a character) and TEXT escaping (backslash first, then
`;` `,` and newlines). All-day `VEVENT`s with stable per-task UIDs so
subscribers update rather than duplicate; done and undated tasks are
left out. Subscribing goes through Traefik basicauth, so the URL a
calendar client needs carries those credentials.

Shared calendar arithmetic lives in `src/lib/iso-date.ts` and works on
the date string, never a `Date` in some local zone, so a date cannot
drift a day because of where the server is. `addMonths` clamps to the
end of a shorter month.

## Run sheet (M6)

**One canonical timeline.** `run_sheet_items` is the day; a recipient's
sheet is that timeline filtered through `run_sheet_item_recipients`.
There is deliberately no per-recipient copy of the schedule that could
drift out of step - edit a moment once and every sheet follows. An item
with no recipients stays on the master sheet only.

`src/lib/run-sheet.ts` is the pure half (times, ordering, filtering,
problem detection). `findProblems` reports a **double booking - the same
recipient due in two places at once** - not a bare overlap. Overlapping
stretches are normal (hair and makeup at the house while the caterer
loads in at the venue); flagging those trains you to ignore the panel.

### PDFs

`src/lib/run-sheet-pdf.ts` renders with pdfkit. Two things matter:

1. **Fonts are vendored TTFs** in `src/assets/fonts` and embedded. The
   PDF standard-14 fonts are WinAnsi-encoded and cannot represent a
   macron, which would mangle "Kōwhai" and "pōhutukawa". Do not switch to
   the built-ins to save 168KB.
2. **pdfkit is in `serverExternalPackages`** (next.config.ts). It reads
   its own font metrics off disk when a document is constructed;
   bundling rewrites those paths and construction fails with ENOENT.

The Dockerfile copies `src/assets/fonts` explicitly - the fonts are read
from `process.cwd()` at request time and standalone output tracing does
not know about them. If you change where fonts live, change both.

Sheets are generated per request at `/admin/run-sheet/[recipient]/sheet.pdf`,
with `everyone` for the master copy, so a download always matches what
is on screen.

## The public invitation (M7)

The one part of this app a stranger could load. Everything about it is
shaped by that.

- **The landing page at `/` is the front door**, and says the least it
  can: names, date, the *town* (not the address), and "use the link we
  sent you". A guest who has mislaid their link meets that instead of a
  404 and a fright. It carries a quiet "Planning" link to `/admin`,
  which is only a URL - the password still stands in front of it.
- **The planner moved to `/admin/*`** to free up `/`. That is a routing
  convenience, not the security boundary; see the Deployment section.
- **The link is the credential.** `households.invite_token` is 100 bits
  from `crypto.getRandomValues` over a 32-character alphabet with every
  confusable pair removed (`src/lib/invite-token.ts`) - tokens get read
  aloud down the phone. No accounts, no sessions, no email. Null means no
  link has been minted, which is what "not invited" looks like from the
  guest's side.
- **`public_site.published` is a kill switch and defaults to off.** An
  unpublished site 404s every link, including ones already sent. A
  wedding site that goes live before anyone meant it to is the failure
  worth engineering against, so the safe state is the default.
- **`src/lib/public/` is the only way in.** `queries.ts` names every
  column a guest may read; `mutations.ts` holds the only writes a
  stranger can cause, and each one re-resolves the household **from the
  token** rather than trusting an id in the form.
- **The schedule is the run sheet.** `run_sheet_items.guest_visible`
  picks the moments; `guest_note` is what guests are told about them.
  The time, title and place are shared, so the two audiences can never
  disagree about when the ceremony is - but `detail` is written for
  suppliers ("power is on the north wall") and is never published.
- **Photographs** go to S3-compatible storage via a presigned POST, so
  the browser uploads straight to the bucket and a hundred guests on
  marquee wifi are not funnelled through the VPS. The policy enforces
  type and an 8MB cap at the bucket. `src/lib/image-prep.ts` re-encodes
  on the device first, which fixes HEIC, size, EXIF rotation and the GPS
  tag in one pass. The bucket stays private and the app streams every
  image, so hiding one takes effect immediately instead of racing a
  signed URL. Moderation is hide, never delete.
- **Two serving routes on purpose**: `/i/photo/[id]` refuses anything
  hidden (public), `/admin/photos/[id]/image` does not (behind basicauth), or
  the couple could not see what they had hidden in order to unhide it.
- `/wall` sits outside `admin/` so a projector gets the picture
  and no sidebar. It is still behind basicauth.

### The invitation's design

Same paper, ink and brass as the planner in an entirely different
register: the planner is a ledger, this is the card that came in the
envelope. Generous, one idea per screen, mobile-first.

- **The signature is breaking a wax seal.** An envelope addressed to the
  household, the couple's duogram struck into the wax, and one
  orchestrated sequence on tap - the wax cracks along an irregular fault
  and falls, the flap swings, the card rises. Then complete stillness:
  the drama is spent in one place deliberately, and nothing else on the
  page moves.
- It is rendered **under** the server-rendered invitation, so `<noscript>`
  removing it leaves a working page. A cookie records that it has been
  opened and the *server* then leaves it out entirely, so a returning
  guest never sees it flash past.
- `wax-seal.tsx` is drawn deterministically - no RNG, because it renders
  on both server and client. What makes it read as wax is the lighting
  being inverted between surfaces: the blot is domed (lit upper left),
  the die impression is recessed (lit lower right), the monogram stands
  proud again. Get those the same way round and it collapses into a
  sticker.
- Three CSS traps, all commented at the point of use: SVG `<g>` needs
  `transform-box: fill-box` or percentage translates never apply;
  `backface-visibility: hidden` makes the flap vanish mid-swing; and
  `preserve-3d` means depth, not `z-index`, decides what occludes the
  flap - hence its `translateZ(1px)`.
- **One new typeface, for one glyph.** EB Garamond italic sets the
  ampersand between the two names, the way an engraver has always taken
  the ampersand from a different fount. Marcellus is lapidary and has no
  italic to give. Loaded by the invitation layout only.
- The `grain` utility sets no `position`, so it can be added to something
  already fixed or absolute. Callers position themselves.

## Design language ("engraved stationery meets ledger")

- Single deliberate light theme; no dark mode.
- Tokens live in `globals.css`: paper/card surfaces, evergreen ink, brass
  accent, hairlines; the sidebar is the dark "spine".
- Side A is sage, side B is rose, threaded through chips, the duogram and
  (later) priorities and task ownership. Semantic green = fern, red = madder.
- Type: Marcellus (display), Figtree (UI), IBM Plex Mono for all money and
  counts (`.figures` utility). Small-caps eyebrows use `.eyebrow`, double
  hairline header rules use `.rule-double`.
- The app icon is two interlocked sage/rose rings on the spine dark:
  `src/app/icon.svg` is the master, with `favicon.ico` (16/32/48) and
  `apple-icon.png` (180, square because iOS masks its own corners) **generated
  from it**. Change the master and regenerate both, or they drift. It is the
  duogram's meaning, not its letterforms - initials set in Marcellus are
  illegible at 16px, so the side A/B colour pairing carries it instead. The
  master sticks to plain paths and avoids `rect`/`rx` and `clipPath`: the
  rasterisers used to derive the other two get those wrong.
- UI primitives in `src/components/ui.tsx`; forms post to server actions via
  `ActionForm` (returns `ActionResult`), dialogs use native `<dialog>`.
- Sliders use the shared `<Slider>` (`src/components/slider.tsx`) and the
  `.slider` utility. The input is deliberately much taller than its
  hairline track so it stays easy to grab; `--fill` paints the travelled
  part. Never hand-roll a range input.
- **No native `<select>` or `<input type="date">` anywhere.** Use
  `<Select>` (`src/components/select.tsx`) and `<DatePicker>`
  (`src/components/date-picker.tsx`). Both post through a hidden input, so
  they drop into an `ActionForm` where the native control used to sit, and
  both take `value`/`onChange` for the client-state pages instead.
  - Both sit on `<Popover>` (`src/components/popover.tsx`), which uses the
    native popover API. That is what lets a menu open inside a `<dialog>`:
    the UA stylesheet gives dialogs `overflow: auto`, which would clip an
    absolutely positioned panel. Placement is ours; dismissal is the
    platform's.
  - `Select` is the APG select-only combobox: focus stays on the trigger,
    `aria-activedescendant` tracks the row, and arrows, Home/End and
    type-ahead all work. `DatePicker` is a `role="grid"` calendar with a
    roving tabindex; arrows move a day, PageUp/Down a month, with Shift a
    year. Its arithmetic is `iso-date.ts` string maths, never a local
    `Date`.
  - A required date is expressed as `clearable={false}` rather than a
    `required` flag: there is then no empty state to submit.
- `Field` (`src/components/field.tsx`) hands its caption's id down through
  context. A control built out of a button has to point `aria-labelledby`
  at it, or name computation folds in the button's own text and announces
  "Side Ru's" instead of "Side".

## Working on a phone

The two of you plan on phones as much as on a laptop, so every page has to
hold up at 390px.

- The spine is a column at `lg` and up and a drawer below it, one DOM
  instance either way (`src/components/app-shell.tsx`).
- Row actions use the `.row-actions` utility, not `group-hover:opacity-100`:
  a phone has no hover, and hidden edit and delete buttons are unreachable.
- Controls carry `pointer-coarse:min-h-11` and `pointer-coarse:text-base`
  (below 16px, iOS zooms the page on focus). `IconButton` grows its padding
  the same way. Prefer the `pointer-coarse:` variant over a width
  breakpoint - it asks the real question, which is whether this is a finger.
- Any `grid` with a responsive column count needs an explicit `grid-cols-1`
  as well. Without it the implicit track is `auto`, which sizes to content
  and pushes a card wider than the phone.
- A wide table lives in `overflow-x-auto` **and** carries a `min-w-*`, so it
  scrolls rather than squashing its columns to nothing.
- `PriorityBars` renders the two of you as stacked sage/rose five-step
  bars - the visual shorthand for agreement and disagreement.

## Venue options (M8)

`src/lib/venues.ts` is the third pure module, and the shortest. It answers
"what would each of these places actually cost us, and does everyone fit",
at a guest count you move with a slider on `/admin/venues`.

**It is deliberately opinion-free.** No scoring, no weights, no "which
venue is nicer" total - only facts that can be checked. A weighted score
would put a spurious ordering on the one decision that is least about
arithmetic. How somewhere feels lives in `notes`, and the page says so.

- Costs are the same fixed + per-head split as budget items, and
  `resolveChildRate` / `GuestCounts` / `assertGuestCounts` are imported
  from `budget.ts` rather than restated - a venue and a budget item can
  never disagree about what a child costs.
- **A venue with no per-head rate is priced with an outside caterer**,
  never as free food. `venues.per_head_cost_cents` is null when a place
  quotes no rate - dry hire, or nobody has rung them - and the
  comparison fills the gap from `settings.catering_per_head_cents`,
  editable at `/admin/settings`. Otherwise a bare hall's $1,200 of hire
  reads as a tenth of a homestead when the real difference is who
  invoices you for the dinner. Every total built that way carries
  `cost.cateringAssumed`, and the page marks it in brass wherever it
  shows: the number is comparable, but it is ours and not theirs. Zero
  would mean they genuinely feed everyone for nothing, which is not a
  quote anyone receives - so the migration turned the old zeroes null.
  An assumed spend *counts towards* a minimum spend rather than
  stacking on top of it: a venue quoting a food minimum caters, so a
  blank rate there means unasked, and billing both would charge the
  same dinner twice.
- **A hire fee nobody has asked for is null, and blocks.** This is the
  mirror of the rate above and the reason the two are worth reading
  together: a missing catering rate has a defensible number to fill it
  with, and a hire fee has none - on one shortlist they run from nothing
  to forty thousand. So `venues.hire_fixed_cost_cents` is nullable, an
  unquoted venue carries `cost.hireUnknown` and a `hire_unknown` blocker,
  and its total is shown as a floor ("from $10,290", "hire not quoted").
  Existing zeroes were *not* migrated to null, unlike the catering
  rates: a venue that charges no separate hire fee is a quote you
  receive all the time, because the room is in the per-head package.
- **A minimum spend is a floor on catering, not on the bill.** Venues
  quote a hire fee *and* a food-and-beverage minimum, and the hire fee
  does not count towards it: `hire + max(perHeadSpend, minimum)`.
  `breakEvenAdults` is the guest count at which the minimum stops costing
  you, and it is the number that decides whether a cheap-to-hire venue is
  affordable at all. In the seeded data The Harbour Rooms is the whole
  point: the lowest hire fee on the list and the dearest venue on it.
- **Capacity is counted in chairs** - adults + children, infants on laps,
  exactly as in `seating.ts`. `TIGHT_SEAT_MARGIN` is 5, because guest
  numbers move by a handful right up to the week before.
- `blockers` is why a venue is not bookable *on today's information*, as
  data rather than a sentence (the page words it, as `buildReport` does).
  `capacity_unknown` is the subtle one and is a blocker on purpose: "the
  cheapest one that works" claims everyone fits, so a hall nobody has
  measured must not win on that blank. An unknown *date* does not block -
  not having rung them yet says nothing. A missing catering rate does not
  block either, because it no longer leaves a hole in the total: it is
  estimated and labelled, which is what makes the comparison glanceable
  rather than a list with a trap in it. `hire_unknown` is the same
  argument as `capacity_unknown` applied to money.
- Blocked venues sink to the bottom rather than disappearing: a venue too
  small at 120 is back in the running at 90, and hiding it would hide
  that. `venueOrder` does the sinking, and does it **whichever column you
  sorted by and whichever way round** - sorting is a question about the
  venues you have a choice between. `costOrder` is now just
  `venueOrder(…, { key: "total", direction: "asc" })`.
- **A blank sorts last in both directions.** Reversing turns the list
  over; it must not float every venue nobody has measured to the top,
  because an unknown capacity is not a very large one. Only `rank` and
  `seats` can be blank - every money column is a number for every venue,
  estimated or floored but never absent.
- `venueOrder` takes a `rankOf` callback rather than importing the
  ranking, so your preference can be a sortable column without this
  module learning what a preference is.
- Venues write nothing into budget items or scenarios. The comparison is
  useful long before the budget is settled, and a venue you later delete
  must not tear a hole in a saved scenario.
- Every function is generic over `V extends Venue`, so the page passes
  whole rows and gets whole rows back without a cast.

### Importing a shortlist

`src/lib/venue-csv.ts` (pure, tested) behind `/admin/venues/import`. A
venue shortlist is researched in a spreadsheet, not typed into an app,
so this reads the spreadsheet rather than demanding its own:

- **Headers match by alias** - `Venue`, `Max seated`, `Venue hire (NZD)`,
  `Website`, and `travel_*` by prefix, because that column names the town
  you leave from. `VENUE_CSV_HEADERS` is the canonical spelling; only a
  name column is required.
- **Every column the arithmetic cannot use is kept verbatim in the
  notes**, under its own heading, in file order. That is where region,
  catering policy, accommodation and price confidence end up - the prose
  is the part of this decision no column settles. Travel and curfew are
  kept *as well as* parsed, unless the cell said only the number:
  "115 min" loses the flight and "23:00" loses which curfew it was.
  Only totals the app recomputes are dropped.
- **Nothing is inferred into a money column.** `ask` imports as null, not
  zero. A catering figure the file itself labels as the researcher's own
  estimate is dropped rather than stored as a quote.
- **Per-head rates are divided back out of a catering total** when the
  header states the guest count (`Catering est. (121 guests)`) and the
  basis column says the venue published it. That is arithmetic on their
  figure; anything else is left to the assumed caterer.
- Row-level `warnings` say all of this in the preview, before the button
  is pressed. Venues already on the list are skipped by name, so
  re-importing is safe.

## Ranking the shortlist (M9)

`src/lib/venue-ranking.ts` is the fourth pure module, behind
`/admin/venues/rank`. It exists because the shortlist grew past seventy
venues, which is more than anyone can hold in their head.

**It does not weaken the rule above - it is the other side of it.**
`venues.ts` still refuses to score, and nothing in `venue-ranking.ts`
reads a price, a capacity or a travel time. The opinion here is
**entered, never inferred**: the app asks which of two venues you would
rather get married at and adds up the answers. Taste is recorded, not
computed.

- **Pairs, not ratings.** Rate seventy-odd venues out of five and you get
  a column of threes. Asked which of two you prefer you answer instantly.
  The scale is what people are bad at.
- **Bradley-Terry fitted by MM, not running Elo.** Sequential Elo depends
  on the order answers arrived in - the same opinions typed in a
  different order would give a different table, which is indefensible for
  something you are going to argue in front of. `fitStrengths` is a
  maximum-likelihood fit over the comparisons *as a set*: reproducible,
  and untroubled by preferring A to B, B to C and C to A, which happens
  with venues constantly and is not an error.
- **Every venue starts with one drawn game against a middling opponent
  of fixed strength 1.** That prior is what keeps the fit finite - a
  venue that won its only comparison would otherwise have infinite
  strength - and because the phantom is fixed rather than fitted, the
  result is deliberately **not** renormalised. `strength` is absolute: 1
  is middling, 2 means you would pick it over a middling venue two times
  in three, and a venue's number does not move because an unrelated
  venue was added to the list.
- **`islands` is the `capacity_unknown` of this module.** If nothing
  connects two groups of venues, no answer of yours ranks one against the
  other - but the fit returns a confident-looking column either way. The
  page says so, and marks the rows. Venues with no comparison at all are
  reported separately, as the more basic problem.
- **`nextPair` is where the quality is**, because you will answer a few
  hundred of 2,485 pairs and *which* few hundred decides whether the
  ranking means anything. Three rules in order: include a least-compared
  venue; join two islands, larger first; then ask the pair the fit puts
  closest, since a comparison you can already call teaches nothing. It is
  seeded (`mulberry32`, as in `seating.ts`) so the question asked is
  reproducible, and it coin-flips which venue sits on the left - a fixed
  side would quietly collect whatever bias that carries.
- **Disagreement is counted, not modelled.** `contestedPairs` reports
  only pairs the two of you picked opposite winners of. Fitting a ranking
  each and diffing them would dress a handful of sparse opinions up as a
  disagreement about the whole list. One of you having a view where the
  other could not split them is not a contradiction and is not counted.
- `MIN_COMPARISONS_PER_VENUE` is 6 - where a strength stops swinging on
  any one answer. It is a rule of thumb, presented as one; venues short
  of it are marked provisional rather than hidden.
- **`rank` is null for a venue nobody has compared, and uncompared
  venues take up no rank numbers.** They do not have a poor position,
  they have none. Numbering them would also make the figures useless
  while the list is young: seventy venues nobody has judged all tie on
  the prior, so the handful you *have* judged would read 8th and 67th of
  76 rather than 2nd and 7th of the seven you have an opinion about.

The comparison table carries the ranking as its `#` column and sorts by
it **by default** - "which do we want" is the question you arrive with,
and the money is what you check it against. With nothing compared yet
every venue is unranked and the order falls through to cheapest first,
which is exactly the table that page has always shown. A faint number is
provisional and a dash is uncompared. Note the `#` you see there is the
same number the rank page shows, and ranks 1-7 can all sit below the fold
if those venues are blocked - the sinking rule wins over the sort, by
design.

`venue-detail.tsx` is the whole record for one venue and is **shared**:
the comparison opens it in a row's disclosure, the ranking board in a
`size="lg"` dialog behind the ⓘ on each head-to-head card. It lays out
with **container queries** (`@2xl`/`@4xl`), not breakpoints, because the
two hosts are different widths at the same viewport - against the
viewport the dialog would take three columns on a desktop and squeeze
`58 × $165.00` into 230px. A choice card is a `div` holding a stretched
`absolute inset-0` button, so the whole surface picks the venue while the
ⓘ (at a higher `z-index`) still gets its own corner; nesting it inside a
`button` would be invalid and the inner one would stop working. The
keyboard shortcuts bail while any `dialog[open]` exists - otherwise an
arrow key would answer the pair and swap out the venue you were reading.

`venue_comparisons` stores the pair one way round (lower id first) with a
unique constraint per judge, so re-answering replaces rather than stacks:
a comparison is what you think of that pair, not an event. The board
holds answers in client state and the actions **deliberately do not
revalidate** - at a few hundred taps, refetching every venue per tap is
the difference between ranking the list and giving up. Ruled-out and
blocked venues are ranked like any other: filtering them was considered
and declined, same argument as `costOrder` sinking rather than hiding.

## Milestones

M1 foundation, M2 budget & scenarios, M3 savings projection, M4 seating
solver, M5 timeline and M6 run sheet were the original brief and are all
done. M7, the public invitation, was requested afterwards and changed the
premise the earlier work assumed - there is now a surface a stranger can
load. M8, venue options, came later again and is planner-only: nothing
about it touches `(public)`. M9, ranking the shortlist, was asked for
once the list passed seventy venues and is planner-only too. Anything
further is a new request, so ask before starting one.

The couple are Ru (side A, sage) and Malin (side B, rose); names live in
the `settings` row and drive every side label in the UI. Edit them, the
wedding date and the savings plan at `/admin/settings` (gear in the sidebar
footer).
