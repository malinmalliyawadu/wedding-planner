# Deploying The Wedding Ledger

Coolify on your Vultr VPS, behind Traefik. Coolify builds the Dockerfile
straight from GitHub — there is no CI pipeline and no image registry,
because this app inlines no build-time secrets and needs neither.

> **The app contains no authentication whatsoever.** That is by design:
> the brief puts Traefik basicauth in front of it. Until step 5 is done,
> anyone who finds the URL can read your guest list, home addresses,
> budget and savings. **Do step 5 before you point DNS at it**, or keep
> the app on an internal-only domain until it is in place.

## What you need

- A Coolify instance running on the Vultr VPS
- A domain or subdomain (e.g. `wedding.yourdomain.nz`)
- The GitHub repo connected to Coolify (private repos need Coolify's
  GitHub App or a deploy key)

## 1. Postgres

In Coolify: **New Resource → Database → PostgreSQL 17**. Give it a name,
let Coolify generate the password, and note the **internal** connection
string — the one on the Docker network, not a public URL. It looks like:

```
postgres://postgres:<generated>@<service-name>:5432/postgres
```

Leave the database unexposed to the internet. The app is the only thing
that needs it.

## 2. The application

**New Resource → Application → Public/Private Repository**

| Setting | Value |
|---|---|
| Repository | `malinmalliyawadu/wedding-planner` |
| Branch | `main` |
| Build pack | **Dockerfile** |
| Dockerfile location | `/Dockerfile` |
| Port | `3000` |
| Health check path | `/api/health` |

The image runs migrations before starting the server, so a deploy that
includes a new migration applies it automatically. A migration that fails
stops the container rather than serving a half-migrated app.

## 3. Environment

One variable, marked as a **runtime** (not build-time) variable:

| Name | Value |
|---|---|
| `DATABASE_URL` | the internal connection string from step 1 |

Nothing else is required. `NODE_ENV`, `PORT` and `HOSTNAME` are baked
into the image.

There is no build-time database access — every page is `force-dynamic` —
so the build does not need `DATABASE_URL`, and will fail loudly at
container start if it is missing at runtime.

## 4. Domain

Set the FQDN in Coolify (e.g. `https://wedding.yourdomain.nz`). Coolify
configures Traefik and provisions the Let's Encrypt certificate. Point an
A record at the VPS first, or the certificate challenge will fail.

## 5. Basicauth — do not skip this

### 5a. Generate the hashes

This prints a `user:hash` line. The password never leaves your machine.

```bash
htpasswd -nbB ru 'choose-a-strong-password'
```

No `htpasswd` installed? Use the Docker image instead:

```bash
docker run --rm httpd:alpine htpasswd -nbB ru 'choose-a-strong-password'
```

Run it again for Malin. You will combine both into one label,
comma-separated.

### 5b. Find the router name — Coolify generates it, you do not

This is the step that catches people out. Coolify names the router
itself, something like `https-0-wc04wo4ow4scokgsw8wow4s8`. A label
pointing at a router name you invented attaches to nothing, the site
stays wide open, and **nothing warns you**.

Open the application → **Configuration → Labels**. You will already see
generated labels including a line like:

```
traefik.http.routers.https-0-wc04wo4ow4scokgsw8wow4s8.middlewares=gzip
```

Copy that router id.

### 5c. Add the middleware and attach it

Two labels. Note the second one **appends** to whatever middlewares are
already listed — do not drop `gzip` if it is there:

```
traefik.http.middlewares.wedding-auth.basicauth.users=ru:$2y$05$...,malin:$2y$05$...
traefik.http.routers.https-0-wc04wo4ow4scokgsw8wow4s8.middlewares=gzip,wedding-auth
```

Redeploy for the labels to take effect.

If the hash appears mangled or the container fails to start, the `$`
characters are being interpolated — double each one (`$$2y$$05$$...`)
and redeploy again. Which form you need depends on how Coolify renders
labels for your setup, so treat step 5d as the arbiter rather than
guessing.

### 5d. Verify — this is the step that actually protects you

From a machine or browser that has never loaded the site (a phone on
mobile data is ideal, since your laptop may hold a cached session):

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://wedding.yourdomain.nz
```

- `401` — correct, the middleware is live.
- `200` — **the app is wide open.** Every guest address, the budget and
  the savings are public. Remove the domain in Coolify, fix the labels,
  and only put it back once this returns `401`.

Check a deep route too, not just the homepage — a middleware attached to
the wrong router can protect one path and miss the rest:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://wedding.yourdomain.nz/guests
curl -s -o /dev/null -w '%{http_code}\n' https://wedding.yourdomain.nz/timeline/tasks.ics
```

Both must be `401`. Then confirm the credentials actually work:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -u ru https://wedding.yourdomain.nz
```

That should prompt for the password and return `200`.

## 6. First run

The database starts empty. The app handles that: every page shows an
empty state rather than breaking, and `/settings` is where you set your
names, the wedding date and the savings plan.

**Do not run `pnpm db:seed` against production.** It truncates every
table and inserts the fake wedding. It exists for development only.

Start with:

1. `/settings` — your names, the real wedding date, monthly savings
2. `/guests` — import the real list from CSV
3. `/budget` — replace the seeded items with your real quotes
4. `/timeline` — press "Build the plan from the wedding date"

## Calendar subscription

`/timeline/tasks.ics` sits behind the same basicauth, so a calendar
client needs credentials in the URL:

```
https://ru:password@wedding.yourdomain.nz/timeline/tasks.ics
```

Most clients accept that form. Some (notably iOS) prefer being given the
username and password separately when adding a subscribed calendar.

## Backups

Everything lives in Postgres — there are no uploads and no local state,
so the database is the whole backup surface. Coolify can schedule
Postgres backups to S3-compatible storage; set that up once and it covers
the lot. To take one by hand:

```bash
docker exec <postgres-container> pg_dump -U postgres postgres | gzip > wedding-$(date +%F).sql.gz
```

## Updating

Push to `main`. Coolify rebuilds and redeploys; migrations run on start.
Rolling back means redeploying an earlier commit — but note that a
rollback does **not** undo a migration, so a schema change needs thought
before it ships rather than after.

## If something is wrong

| Symptom | Likely cause |
|---|---|
| Container restarts in a loop | `DATABASE_URL` wrong or unreachable; the log names it explicitly |
| `502` from Traefik | App still starting, or the port is not 3000 |
| Health check failing | `/api/health` returns 503 with the Postgres error in the body |
| Site loads without a password | Middleware not attached to the real router — almost always a wrong router name in step 5b. Treat as urgent |
| Container fails to start after adding labels | `$` in the hash is being interpolated; double them to `$$` |
| PDFs 500 | Fonts missing from the image; check the `src/assets/fonts` COPY in the Dockerfile |
