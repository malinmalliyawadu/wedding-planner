@AGENTS.md

# The Wedding Ledger

Wedding planning app for exactly two users (partner A and partner B), plus
a public invitation for their guests.

**Two audiences, one deployment, and the split is structural:**

- `src/app/admin/` - the planner, at `/admin/*`. Behind the app's own
  sign-in (M10), may read anything. `src/app/wall/` is also private but
  sits outside the group so a projector gets no sidebar.
- `src/app/(public)/` - everything a stranger can load: the landing page
  at `/` and the invitations at `/i/*`. **Served with no sign-in in front
  of it.** Reaches the database only through `src/lib/public/`, and
  `no-private-imports.test.ts` reads that exact folder to enforce it.
- `src/app/login/` - in neither group, and that is the point: it is
  unauthenticated but not guest-facing, so it may read the session tables
  that `(public)` may not.

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
secrets. The required runtime variables are `DATABASE_URL` and
`APP_PASSWORD`.

**The app authenticates the planner itself** (M10), so basicauth in front
of it is now optional belt and braces rather than the only lock. Any
change touching routing, the proxy or the auth library needs both halves
verified afterwards: `/admin/guests` must redirect to `/login`, and `/`
and `/i/<a real token>` must return `200`.

**Check bodies, not just status codes.** A refusal that still carries the
page underneath is the failure mode a status-code check cannot see, and
it has happened once already here: letting a request past the session
gate renders the page before the layout's guard can redirect, and Next
then answers `307 -> /login` with the whole guest list in the body. So
`curl -s .../admin/guests | wc -c` belongs in the check alongside
`%{http_code}`.

`src/proxy.ts` also keeps the older lock, which matters if basicauth
stays: the public Traefik router stamps a header, and the app 404s any
stamped request that did not land on a public route. That covers the case
a path rule is most likely to get wrong - `/i/../admin/guests` matches
`PathPrefix(/i)` going in and resolves to `/admin/guests` coming out. A
carve-out that matches too much publishes everything, so the Traefik rule
needs ``Path(`/`)``, never ``PathPrefix(`/`)``.

`/_next/image` must never be made public. The optimiser fetches any
same-origin path it is handed, so opening it would serve every private
route that returns an image; the album ships its own thumbnails, made on
the guest's phone, precisely so it can stay shut.

Guest photographs live in S3-compatible object storage, not Postgres, so
**the database is no longer the whole backup surface** - the bucket is
the other half. Without the `S3_*` variables every other feature still
works and the album says it is not configured.

`/api/health` does a real `select 1`, so it reports whether the app can
actually work rather than merely that the process is alive. Coolify probes
it from inside Docker, where there is no cookie to present, so it is the
one private-by-default path exempt from the sign-in - a probe answering
"not signed in" would say nothing about whether Postgres is reachable.

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
- **Every exported action in `src/app/admin/**/actions.ts` opens with
  `await requireAdmin();`, as its first statement.** Not a convention - a
  server action is dispatched by the id in its `Next-Action` header rather
  than by its path, so the proxy is the wrong shape of lock for one and
  the guard inside it is the real boundary around every mutation in the
  planner. `actions-guarded.test.ts` fails the build otherwise, and pins
  the public actions as deliberately *un*guarded.
- Non-goals (do not build or scaffold): guest logins or accounts, a
  public page outside `(public)`, a vendor directory, place cards, email
  sending, mobile apps, per-person planner accounts (the two of you share
  one; a passkey records a device, not a person).

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
left out. A calendar client cannot use a passkey, so this is the one
private route that also accepts the app password over HTTP Basic - the
subscription URL carries it (`https://ledger:<APP_PASSWORD>@host/...`).
See `allowsAppPasswordAuth` in `proxy.ts` and the M10 section.

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
  hidden (public), `/admin/photos/[id]/image` does not (behind the
  sign-in), or the couple could not see what they had hidden in order to
  unhide it.
- `/wall` sits outside `admin/` so a projector gets the picture and no
  sidebar. It is still private: the laptop driving the marquee screen
  signs in once and the session outlasts the night.

### Song requests

The reply card asks for up to three songs (`MAX_SONG_REQUESTS`), picked
from a music catalogue through an autocomplete or typed in when the
catalogue does not have them. `song_requests` is one row per song per
household, replaced whole with every reply; the old one-line
`households.song_request` was carried across as typed requests.

- **The catalogue is Deezer's public track search** (`src/lib/song-search.ts`),
  and that file is the only one that knows it. Discogs was the first
  thought and was set aside: it catalogues *records*, so a title search
  returns pressings, and an album track that was never a single does
  not come up at all. Deezer needs no key. The browser never calls it:
  `/i/[token]/songs` checks the token first, throttles per token,
  caches answers in-process and annotates them with what other
  households have asked for.
- **"Already on the list" is a matching key, not an id.** `songKey` in
  `src/lib/songs.ts` (pure, tested) drops case, punctuation, diacritics
  and version tags - "(Live)", "[Remastered]", "- Radio Edit" - and
  sorts the words of title and artist together, so a typed "ABBA -
  Dancing Queen" and a picked one agree. A dashed suffix only counts as
  a version tag when it says so, or the typed form would lose its
  title. The catalogue's track id is stored for provenance and never
  looked up. A guest is told a song is already asked for, never by
  whom, and only for songs they searched for themselves.
- **Typing is always a way in**, offered as the last row of every list,
  so an obscure song or a catalogue outage never blocks a reply. A
  typed request with no artist keys on the title alone and does not
  match a picked one - "Hallelujah" is not a song the band can be sure of.
- `/admin/invitations` shows each household's songs and, under "For the
  band", the whole list with the households that asked for each song
  and a count where they agree. Requests are per household, never per
  guest: the card is one reply for everyone on it.

### The card as a whole (the second pass)

The first pass made the invitation a page of type with an envelope in
front of it. The second pass made it one object - a card you can hold -
and gave the long page a way to be *used* as well as read.

- **The date and the time are both set in figures**: "Saturday 20
  March 2027" over "at 2:30 pm", through the same `formatTime` the run
  sheet uses. Both were once spelled out - "the twentieth of March, two
  thousand and twenty-seven", then "at half past two in the afternoon" -
  and both were cut: the words read as stiff rather than formal, and a
  guest should never have to parse prose to find when to turn up. The
  figure on the card is the same figure the at-a-glance strip and the
  programme show, so the three can never disagree.
- **The card is addressed** ("An invitation for Ngata Whānau") and the
  couple's welcome is set as a letter to that household. The envelope
  carried the name; a guest who skipped the seal still knows this one
  is theirs.
- **A double rule frames the names** (`Frame`, `FrameCorners`), inset
  in pixels so the gap is even on a tall phone-width box. It fades up
  whole, paused under `main[data-envelope="pending"]` with the names.
  Drawing it on as a stroke was tried and cut: a box caught with two
  sides missing reads as broken, not as ruled, and structure must never
  be seen half-built. Reused on the reply card, the uploader and the
  front door, so the frame is *the* device of the second pass the way
  the sprig was of the first.
- **The at-a-glance strip** is the information architecture: when,
  where, wear, reply by - the four facts a guest comes back for at
  eleven at night - each a link into its section. It sits under the
  welcome, before the day in full.
- **The ribbon** (`ribbon.tsx`) follows the reader once the card's face
  has scrolled away: monogram, the sections that exist, the reply. It
  is anchors into one page, never routes, so the invitation stays one
  shareable URL and the back button behaves. Scroll-spy is a rAF-throttled
  measure of which section's top has passed 40% of the viewport - the
  heading you scrolled past is the section you are in. Smooth anchor
  scrolling is keyed off `main[data-invitation]` so the planner's tables
  still jump.
- **The day is a programme**: a brass spine with a seed at each moment,
  the ceremony's seed a lozenge. Times in the display face, never mono -
  mono is the planner's figure style and reads as a run sheet, which is
  what this is *made from* and must not look like.
- **The reply is a reply card**: "Accepts with pleasure" and "Declines
  with regret" with the printed tick box, fields as ruled underlines
  (`field-line`) rather than boxes, and on success the couple's wax seal
  stamped under the form. Same radio semantics as before - "not ticked"
  and "cannot come" are still different answers.
- **No cards.** `Panel` is gone from the invitation; the travel and
  accommodation notes are a `Spread` - two leaves of a folded programme
  divided by a hairline. A rounded box with a shadow is the planner's
  furniture and reads as a website on stationery.
- **Blocks arrive as you reach them** (`Rise`), on the same
  `view()`-or-`data-shown` path as the marginalia, so there is one
  fallback and reduced motion switches one list off. The rise runs over
  a fixed 30vh of scroll (`entry 0% entry 30vh`), not a share of the
  block's own height: written as a percentage, a section heading was
  over in under one turn of a mouse wheel and simply appeared, while the
  reply card stayed translucent for most of a screen.
- **The album lays prints at their own proportions** in columns, using
  the width and height recorded at upload so nothing reflows, and opens
  one at a time on a native `<dialog>` lightbox. The invitation shows
  the three latest fanned on the table. The uploader takes a drop as
  well as a tap.
- **The front door is a calling card**: the unbroken seal at the head,
  names, the date, the town - and nothing more than before.
- **The venue is drawn** (`lodge.tsx`): Pencarrow Lodge from the
  ceremony lawn, in the sprig's brass line, sitting above the venue's
  name on the card's face and above the town on the front door - the
  vignette an engraved letterhead carries. Tone is hatching computed
  per face (`hatch`), nothing is filled, and the hills behind are
  *clipped out of* the house's silhouette rather than painted over
  with paper: a paper-coloured fill would show as a lighter patch on
  the wash. It does not draw itself on - it is far more line than the
  ornament and `stroke-dashoffset` over it would be the repaint the
  note in `globals.css` warns against - so it rises with the type. It
  is a drawing of one building, so `isVenueDrawn` shows it only while
  the venue name in settings says the wedding is there; the seed's
  fake wedding is elsewhere and does not show it.
- **The dress code is drawn too** (`attire.tsx`): four garments on a
  rail - a dress to the knee, a suit with its tie, a coat, a pair of
  low shoes - and eight colour dabs, under the phrase. Examples, not a
  uniform, and chosen for an exposed coast: the coat hangs where a sun
  hat would on a lawn. Found artwork was looked for first and set
  aside: what is free is felt-tip clip art, pencil scans, or the
  Rijksmuseum's 1930s fashion plates, which are pictures of 1931. Like
  the lodge it is a drawing of one dress code, so `isCocktail` shows it
  only while the dress code in settings says "cocktail"; change that
  and it goes rather than illustrating something else. The hanging
  three sway from the hook (`idle-sway`, a fraction of the bow's
  swing); the shoes lie still.

### The third pass: the card answering back

The first two passes moved on the clock and the scrollbar. This one adds
the few things that move because the guest did something, and takes
one thing away.

- **Tapping the envelope is handled by the stage, not the seal**, and
  that is a bug fix before it is a flourish. The seal lives in the
  subtree the camera drifts in Z, and while the drift has it more than
  a pixel behind the camera's own plane, Chrome hands hits at the wax
  to the wrapper instead: the seal was dead for the first several
  seconds of every visit and then quietly started working. Every tap
  lands somewhere inside the stage whatever the compositor decides, so
  the stage listens; the wrappers are `pointer-events: none` as belt
  and braces; the seal stays a `<button>` for the keyboard and the
  screen reader, and Skip stops propagation so it is not read as the
  tap. The whole envelope is the target, which on a phone is simply
  right.
- **The seal beckons** - two small nudges every five seconds, on the
  drawing rather than the button so the hover scale still composes.
- **Things lean towards the pointer** (`Tilt`, `tilt.tsx`): the
  envelope while it is sealed, and the front door's calling card. It
  only writes `--tilt-x` and `--tilt-y`; the class decides what they
  do, which is what lets the same component sit inside the stage's 3D
  context without adding a perspective of its own. Pointer-only and
  reduced-motion-aware at the listener, so a phone never pays for it.
- **The countdown counts up to itself** (`Countdown`, `countdown.tsx`),
  server-rendered as the true figure and written straight into the
  text node. It waits for the envelope, like everything else above the
  fold, and on the day it says "Today" instead of counting to nothing.
- **The reply is stamped, and an acceptance gets petals.** The seal
  comes in large and lands small and a few degrees off square, the way
  a hand-pressed one does; the words underneath rise after it. If
  anyone in the household is coming, `Petals` lets two dozen of the
  sprig's own leaves fall in sage, rose and brass over the last lines
  of the card. Not confetti - paper shapes in primary colours are the
  wrong register - and laid out from a table, not a random source, like
  everything else drawn here. The tick on each choice is a single
  stroke drawn on with the same `pathLength` dash arithmetic.
- **Small answers**: a fact's emblem nods when reached for; each moment
  of the day sets its seed on the spine as it comes up; an answer rises
  under its question; the fanned prints are links into the album that
  straighten and lift in the hand. The prints' angle and lift are
  registered properties (`@property`), which is what lets a hover move
  a transform that belongs to a scroll-driven animation.
- **The ornament no longer draws itself on.** The sprig under every
  heading used to arrive stalk-then-leaves as you scrolled, and it was
  cut: eight headings of the same drawing-on reads as a loading
  indicator, and it was the one paint-level animation on the page. The
  sprig is simply there; the sketches still arrive.

### The invitation's design

Same paper, ink and brass as the planner in an entirely different
register: the planner is a ledger, this is the card that came in the
envelope. Generous, one idea per screen, mobile-first.

- **The signature is breaking a wax seal.** An envelope addressed to the
  household, the couple's duogram struck into the wax, and one
  orchestrated sequence on tap - the wax cracks along an irregular fault
  and falls, the flap swings open on its lining, and the invitation comes
  up underneath as the envelope goes.
- **The framing is macro, and the camera moves.** The envelope is sized to
  run off the edges of a phone (`190%`), because a 1.42:1 envelope on a
  portrait screen is otherwise a band across the middle, and the whole
  flourish is only worth having if it reads as an envelope you are
  holding. The dolly is `translateZ` under the stage's perspective, not
  `scale`: the distance changes, so the foreshortening changes with it,
  and that is most of the difference between a cinematic open and an
  animated one. It pans down as the flap swings, because a flap this size
  needs headroom that does not otherwise exist.
- **Nothing slides out of it.** A card rising was tried and cut: at this
  framing a C6 card covers all but the corners of the envelope, so it hid
  the lining the flap had just uncovered and arrived at the same moment
  as the invitation it was standing in for. The envelope opens, and what
  is inside it is the page.
- **The lining is painted on the envelope, not on the flap.** A flap
  standing open at 138 degrees is nearly edge-on and lands above the
  envelope; what a lined envelope actually shows you is the *throat* -
  the area the flap was covering. `.envelope-throat` carries it and fades
  up as the flap comes off, and the flap's own underside merely agrees.
  Sage and rose, meeting under where the wax was.
- **Nothing in the moving subtree blends or filters.** `mix-blend-mode`
  makes the compositor read back what is underneath on every frame, which
  is free over a still page and the difference between running on the GPU
  and not over a subtree rotating in 3D; `filter` additionally flattens
  the 3D context and would take the flap's two faces with it. So the
  envelope uses `grain-stock` rather than `grain`, and the fold is drawn
  as an offset triangle on the panel beneath rather than as a
  drop-shadow. If you add either back here, you have put the jank back.
- It is rendered **under** the server-rendered invitation, so `<noscript>`
  removing it leaves a working page. A cookie records that it has been
  opened and the *server* then leaves it out entirely, so a returning
  guest never sees it flash past. The same cookie sets
  `main[data-envelope]`: the invitation is held at zero opacity only while
  something is actually over it, and released into `content-reveal` as
  the envelope fades, so the two cross instead of leaving a blank frame
  between them. `<noscript>` releases it too, or a browser that will
  never run the script would never get it back.
- `wax-seal.tsx` is drawn deterministically - no RNG, because it renders
  on both server and client. What makes it read as wax is the lighting
  being inverted between surfaces: the blot is domed (lit upper left),
  the die impression is recessed (lit lower right), the monogram stands
  proud again. Get those the same way round and it collapses into a
  sticker.
- Four CSS traps, all commented at the point of use: SVG `<g>` needs
  `transform-box: fill-box` or percentage translates never apply;
  `preserve-3d` means depth, not `z-index`, decides what occludes - hence
  the flap's `translateZ(2px)` and the seal's `translateZ(4px)`, without
  which the flap swallows the top half of the wax holding it shut - and
  **no two surfaces share a depth** (back -2, front 0, lining 1, flap 2,
  seal 4; the flap's shading is the face's own `::after`, not a third
  sibling), because two planes at exactly the same depth are left to the
  compositor to order, and a depth-buffered one fights it out per pixel
  on every frame the envelope tilts under the pointer;
  `backface-visibility: hidden` is right on the flap's *two* faces and
  was wrong on the one face it used to have, where it made the flap
  vanish mid-swing; and a box deliberately wider than its container
  cannot be centred by `justify-items: center`, because grid and flex
  both fall back to start-alignment for an overflowing item - which
  parks the envelope against the left edge on exactly the narrow screens
  the bleed is for.
- **Watercolour, over the engraving.** The invitation, the landing page
  and the envelope are printed on a washed sheet with painted corners.
  Three watercolour clusters live in `src/assets/florals`, cut from one
  sheet of licensed stock artwork (`17cc.eps`, rendered with Ghostscript)
  so they agree about light, palette and brush. Two rules come with them:
  - **They are not cut out.** Each carries its own wash and is feathered
    on the two edges facing into the page; the other two bleed off. That
    is why they have no silhouette to give them away - and why one only
    works on top of `wash`, whose `--wash-layers` are *sampled from these
    files*. Put a corner on plain paper and its feathered edge becomes a
    visible rectangle of blush. Change either and resample the other.
  - **They go through the bundler, never `public/`.** A static import is
    emitted under `/_next/static/`, which `isPublicPath` already allows;
    a file in `public/` is served from a path the proxy blocks for
    exactly the guests these pages are for. It also keeps `next/image`
    out of it, which matters: `/_next/image` is deliberately not public.
    Nothing under `(public)` may use `next/image`, and the two `<img>`
    tags carry an eslint-disable saying so.
- **The clear middle is the layout.** Type is centred in what is left
  *above* the painted corners, not in the box - hence the lopsided
  `pb-[min(calc(40vw+1.5rem),19rem)]` on the invitation's header. The
  padding tracks the corner's own height, because the corners are sized
  as a fraction of the width; a vh-based gap leaves a hole on a phone and
  still crowds on a laptop. Below the corners a gradient fades the card
  into the page, or a cluster sliced flat against the header's bottom
  edge reads as a mistake rather than as bleed.
- **The ornament is drawn, not placed** (`sprig.tsx`). A botanical spray
  in brass line - stalk, five leaves, a curled tendril, three seeds -
  mirrored about the lozenge the ornament has always had, which is now
  the pivot the two sprays grow out of. It is the gold line vocabulary
  from the painted corners, on its own. It stands alone: the hairline
  rules that used to flank the lozenge are gone, because a flat rule
  butting into the sprig's end curl reads as a line that ran out rather
  than as a finished ornament.
  - Drawn rather than cut out of the artwork because it had to be: the
    gold line in those files runs *behind* the painted leaves, so any
    crop takes green with it. Drawing it also means it recolours,
    rescales and costs nothing.
  - Deterministic like `wax-seal.tsx`. The leaf geometry is computed from
    base/tip/width, but there is no RNG, so the server and client agree.
  - The stroke weights are set for the size it actually renders at, a
    little over 120px wide. Much smaller and the leaves close into a
    smudge, which is why `Ornament` sizes it in rem rather than letting
    it take the height of a line of text.
- **The emblems are drawn too** (`motifs.tsx`), and sit at the heart of a
  section's ornament in place of the lozenge - rings on the RSVP, flutes
  on the day, a gift on gifts, a camera on the album. The subjects are
  the ones every wedding clip-art set has; only the hand is different,
  and that is the whole point. Packs of wedding iconography are almost
  invariably felt-tip doodles - thick, wobbly, cheerful - which is a
  register at war with Marcellus and a watercolour corner. Drawing them
  in the same fine line as the sprig is what lets the page have
  illustrations at all.
  - `motif` on `Section` is optional on purpose. A section with nothing
    obvious to draw gets the plain lozenge rather than a laboured
    metaphor, and the page is better for the odd plain one.
  - Each is drawn in its own 24x24 box and sets no stroke width, so the
    caller picks weight and colour. `Sprig` widens from 120 to 144 units
    when it carries one, which is the only thing the emblem changes.
- **Marginalia, in a second hand** (`src/assets/sketches`, `Sketch`). Six
  pen-and-ink drawings - two doves, a heart, a ribbon, a candelabra, a
  bow - hung in the white space beside a section at 30-40% opacity. They
  are deliberately *not* the engraved line of the sprig: they are looser,
  and that only works while they stay rare. One or two down a long page
  read as something pressed between the leaves; a dozen would read as a
  sticker sheet and would start arguing with the ornament, which is the
  thing doing the structural work.
  - Vector, brass baked in, `<img>` through the bundler like the florals,
    and ~40KB for all six. Nothing is inlined into the HTML.
  - On a phone there is no margin to hang in, so they fall behind the
    text column and behave as a watermark rather than being cropped off.
  - **They arrive as you reach them**, on `animation-timeline: view()`
    where it exists - the compositor drives it, with no listener, and the
    drawing tracks the scrollbar rather than merely being triggered by
    it. The two above the fold have nothing to scroll into and run on a
    clock instead.
  - **`view()` is not everywhere yet**, and this page is opened by a
    hundred guests on whatever browser came with their phone - Firefox
    has no support at all. So `@supports not (...)` holds each flourish
    at its opening state and waits for `data-shown`, which `<Reveal>`
    sets from a single IntersectionObserver for the whole document. It
    costs nothing where `view()` works: the effect returns on its first
    line and no observer is ever built. `<noscript>` releases them, as it
    does the envelope.
  - Because the fallback is a *transition*, reduced motion has to kill
    `transition` as well as `animation`, and `<Reveal>` marks everything
    shown immediately rather than leaving it held at opacity zero.
  - **Everything keeps moving once it has arrived, and each thing moves
    the way that thing would**: a dove rides, a candle gutters (opacity,
    on uneven stops so the loop does not read as one), a ribbon stirs
    from its bow, a heart beats lub-dub and then rests for most of the
    cycle, a hanging bow swings from its knot. The ornament breathes and
    the painted corners drift, both far slower and smaller than the
    flourishes - they are structure and weather respectively, and neither
    should ever be the thing you notice moving. One pulse applied to all
    of them would read as a screensaver; the point is that they are not
    the same motion. All transform or opacity, so they stay composited.
  - Whether one of these is actually running is read off the animation
    engine - `el.getAnimations()[0].effect.getComputedTiming().progress` -
    and never off `getComputedStyle`, which reports stale transforms in a
    backgrounded or non-compositing tab and will happily tell you a
    running animation is frozen.
  - That is why `Sketch` renders a span around the image: the arrival
    owns the span's transform and the idle owns the image's, and two
    animations on one property replace each other rather than composing.
  - **Anything above the fold that arrives on a clock is paused while the
    envelope is up**, alongside `settle` on the names. Breaking the seal
    takes about a second and a half, which is longer than those
    animations run - leave them going and they are spent behind the
    curtain, and the first-time guest, who is the only guest this page
    has, meets a dove that has already landed.
  - Every arrival ends on `translateX(var(--sketch-x))`, never on `none`.
    How far a flourish hangs into the margin is a transform too, and an
    animation that ends on `none` snaps it back into the text column.
  - **The couple portraits in that sheet are deliberately unused.** They
    draw a specific bride and groom who are not Ru and Malin, and a
    stock couple on someone's own invitation is the one thing on this
    page that would read as clip art.
- **One new typeface, for the ampersand and the formula.** EB Garamond
  italic sets the ampersand between the two names, the way an engraver
  has always taken the ampersand from a different fount, and - since the
  second pass - the card's *formula* lines too (`formula` utility):
  "request the pleasure of your company", the line giving the time, the letter
  to the household, the reply card's two choices. On an engraved card the
  names are in caps and the sentences holding them together are in a
  lighter italic; Marcellus is lapidary and has no italic to give, so the
  second fount does both jobs. Loaded by the invitation layout only.
- The `grain` utility sets no `position`, so it can be added to something
  already fixed or absolute. Callers position themselves. `grain-stock` is
  its blend-free, coarser twin for the envelope: see the note above on why
  nothing in the moving subtree may blend.

## Design language ("engraved stationery meets ledger")

- Single deliberate light theme; no dark mode. The planner is the ledger
  half and is printed on plain ivory. The public invitation is the
  stationery half and, since M7's watercolour pass, is printed on a
  washed sheet - same ink, same brass, different paper. The blush tokens
  and `wash` exist for `(public)` only; nothing under `admin/` uses them.
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

## Signing in (M10)

The planner used to have no authentication of its own and leaned entirely
on Traefik basicauth. It now owns the boundary: a passkey each, with
`APP_PASSWORD` behind them. `src/lib/auth/` is the whole of it.

**A passkey records a device, not a person.** There is one account here
and both of you share it, because the planner has no per-person data to
own - every page is written for the two of you. So there is no user
table, the WebAuthn user handle is a constant, and `admin_credentials.label`
("Malin's iPhone") carries the only distinction that matters. Per-person
accounts are a non-goal, not an omission.

- **`APP_PASSWORD` is the bootstrap and the fallback.** A passkey cannot
  be the only credential, because registering one requires already being
  signed in. Unset means *no password login at all* rather than one that
  `""` satisfies - the dangerous reading of a missing variable - and with
  no passkey either, `/login` says so plainly instead of showing a form
  that cannot work.
- **Sessions are opaque tokens in Postgres, not signed cookies.** The
  cookie holds 256 bits of `randomBytes` and every check is a row lookup,
  which is what makes "remove this passkey" and "sign out everywhere" take
  effect on the next request. Only the SHA-256 goes in the table: backups
  leave the machine, and a column of live session tokens should not. A
  plain hash is right where it would be wrong for a password - there is no
  dictionary to run against 256 random bits.
- Expiry is **absolute at 30 days, never extended**. Sliding expiry means
  writing on requests that only read, and re-issuing a cookie from places
  that are not allowed to set one.
- **`admin_sessions.credential_id` cascades**, which is why it is stored:
  removing a lost phone's passkey signs out the browsers that used it, one
  action rather than two. A password session has no credential and
  survives on its own.
- **Challenges are rows, not cookies** (`admin_challenges`), deleted on
  use. A cookie the client can set is a challenge the client can choose,
  and a chosen challenge lets a captured assertion be replayed.
- **The relying party is derived from the request**, not configured, so
  one image works on localhost and on the real domain. A forged `Host`
  cannot let anyone in - the browser signs over the origin it is actually
  on - but it can *refuse* a legitimate sign-in, so `APP_ORIGIN` exists as
  an override for the setups where the forwarded headers are wrong.
- `residentKey: "required"` is what makes these passkeys rather than
  second factors: discoverable, so login needs no username and the page
  offers one button. `userVerification` is `"preferred"` and verification
  is not *required* on the server - every real platform does Face ID when
  asked nicely, and the softer setting means an authenticator that
  declines is refused a passkey instead of the couple being locked out.
- Verification itself is `@simplewebauthn/server`. That is a deliberate
  dependency: by hand it means CBOR-decoding authenticator data,
  converting COSE keys and checking signatures, and the failure mode of
  getting any of it subtly wrong is a lock that looks shut.

### Where the locks are

`src/proxy.ts` gates every path that is not public, written in terms of
the same `isPublicPath` the older stamped-header check uses - one list of
what a stranger may read, so the two cannot drift. `needsSession` is
private-by-default: the question is not "is this one of the pages we
protect" but "is this one of the few we do not". `/api/health` is the only
non-public exemption.

Three things are deliberately *not* covered by that gate, and each is
worth understanding before changing it:

1. **Server actions guard themselves.** See the hard rule above. The
   proxy steps aside for a POST carrying `Next-Action`, because turning
   one away there is both incomplete (the path did not select the action)
   and harmful (an HTTP redirect is not something the router can follow
   for an action POST - the click dies on a page that stays put).
2. **The method matters, and it is the whole of the safety in that
   exception.** `dispatchesServerAction` requires `POST`. A GET wearing
   the same header is an ordinary page request, and letting one past
   renders the page before the layout can redirect - Next then answers
   `307 -> /login` with the guest list still in the body. This was a real
   bug during M10, caught by checking body sizes rather than statuses.
3. **The calendar feed takes the app password over HTTP Basic**, and is
   the one private route the proxy guards alone. A calendar client cannot
   use a passkey, fill in a form or be sent to a login page; it fetches
   one URL forever and the only credential it can carry is a header.
   `allowsAppPasswordAuth` is that one path and must stay that way - every
   extra path is another URL a password can be guessed at.

`requireAdmin()` in the admin layout and `/wall` is the second lock for
pages, and the only lock for the two route handlers that render no layout
(a photograph, a run sheet PDF). It is also how a page gets the session
it is running under.

**Password guesses are throttled**, eight per source per fifteen minutes,
keyed by IP rather than globally - a single bucket would let a stranger
hammering the form lock the couple out, turning a brute-force attempt into
a denial of service. The store is an in-process Map, so it is per-process
and lost on restart; both are fine at this scale and neither is hidden.
Passkeys are not throttled and do not need to be: a wrong assertion is a
signature that does not verify.

`/admin/access` is where passkeys are added, renamed and revoked, and
where the live sessions are listed. The app password is deliberately not
editable there - it lives in the environment, so changing it is a
redeploy, which means a browser someone else is holding cannot change the
credential that would lock them out.


## Milestones

M1 foundation, M2 budget & scenarios, M3 savings projection, M4 seating
solver, M5 timeline and M6 run sheet were the original brief and are all
done. M7, the public invitation, was requested afterwards and changed the
premise the earlier work assumed - there is now a surface a stranger can
load. M8, venue options, came later again and is planner-only: nothing
about it touches `(public)`. M9, ranking the shortlist, was asked for
once the list passed seventy venues and is planner-only too. M10, signing
in, was asked for after that and is the second change to move a boundary:
the planner now authenticates itself instead of relying on the proxy in
front of it. Anything further is a new request, so ask before starting
one.

The couple are Ru (side A, sage) and Malin (side B, rose); names live in
the `settings` row and drive every side label in the UI. Edit them, the
wedding date and the savings plan at `/admin/settings` (gear in the sidebar
footer).
