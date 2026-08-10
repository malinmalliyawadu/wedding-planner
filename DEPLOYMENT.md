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

Traefik needs a `basicauth` middleware on this router. Generate the hash
locally (this prints a `user:hash` line; the password never leaves your
machine):

```bash
htpasswd -nbB ru 'choose-a-strong-password'
```

If you would rather not install `htpasswd`:

```bash
docker run --rm httpd:alpine htpasswd -nbB ru 'choose-a-strong-password'
```

Add the resulting line to a Traefik basicauth middleware and attach it to
this application's router. In Coolify this goes under the application's
**Labels**, and `$` characters in the hash must be doubled to `$$`:

```
traefik.http.middlewares.wedding-auth.basicauth.users=ru:$$2y$$05$$...
traefik.http.routers.wedding.middlewares=wedding-auth
```

Add a second `users=` entry, comma-separated, for Malin.

**Verify it before you trust it.** From a machine that has never loaded
the site:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://wedding.yourdomain.nz
```

`401` is correct. `200` means the app is wide open — take the domain down
and fix the middleware before doing anything else.

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
| Site loads without a password | Basicauth middleware is not attached — treat as urgent |
| PDFs 500 | Fonts missing from the image; check the `src/assets/fonts` COPY in the Dockerfile |
