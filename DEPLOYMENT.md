# Deploying The Wedding Ledger

Coolify on your Vultr VPS, behind Traefik. Coolify builds the Dockerfile
straight from GitHub — there is no CI pipeline and no image registry,
because this app inlines no build-time secrets and needs neither.

> **The app contains no authentication whatsoever.** That is by design:
> the brief puts Traefik basicauth in front of it. Until step 5 is done,
> anyone who finds the URL can read your guest list, home addresses,
> budget and savings. **Do step 5 before you point DNS at it**, or keep
> the app on an internal-only domain until it is in place.

> **Two paths are deliberately public**: `/` (the landing page) and
> everything under `/i` (the invitations). Everything else, the planner
> included, must not be. Step 5 sets basicauth on the whole domain and
> step 6 carves out those two. Getting the carve-out wrong in the
> generous direction publishes the guest list, so **step 6d is not
> optional** - it is the step that tells you which of the two you have.
>
> The planner lives under **`/admin`**. That is a convenience, not a
> security boundary: the rule stays "private by default, public by
> exception", so putting basicauth on `/admin` alone would be a mistake -
> anything added outside it later would be silently public.

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

All **runtime** (not build-time) variables:

| Name | Required | Value |
|---|---|---|
| `DATABASE_URL` | yes | the internal connection string from step 1 |
| `S3_BUCKET` | photos only | the bucket guest photographs go in |
| `S3_ACCESS_KEY_ID` | photos only | an access key scoped to that bucket |
| `S3_SECRET_ACCESS_KEY` | photos only | its secret |
| `S3_ENDPOINT` | usually | e.g. `https://ap-south-1.vultrobjects.com`. Omit only on real AWS |
| `S3_REGION` | no | defaults to `us-east-1`, which non-AWS services ignore |
| `S3_FORCE_PATH_STYLE` | no | defaults to on; set `false` only if your provider needs virtual-host style |

`NODE_ENV`, `PORT` and `HOSTNAME` are baked into the image.

Without the `S3_*` variables everything works except guest photographs:
the album tells guests it is not set up rather than throwing at them,
and `/admin/photos` in the planner says the same to you. See step 7.

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
curl -s -o /dev/null -w '%{http_code}\n' https://wedding.yourdomain.nz/admin/guests
curl -s -o /dev/null -w '%{http_code}\n' https://wedding.yourdomain.nz/admin/timeline/tasks.ics
```

Both must be `401`. Then confirm the credentials actually work:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -u ru https://wedding.yourdomain.nz
```

That should prompt for the password and return `200`.

At this point **everything** needs a password, invitations included. The
next step is the only place that changes.

## 6. Letting guests in - and only to `/` and `/i`

What guests may reach, and nothing else:

| Path | Who | What |
|---|---|---|
| `/` | anyone | the landing page: names, date, town, "use your link" |
| `/i/<token>` | guests | the invitation, the schedule, the RSVP form |
| `/i/<token>/photos` | guests | the shared album |
| `/i/<token>/wedding.ics` | guests | the calendar file |
| `/i/photo/<id>` | guests | one photograph (`photo` can never be a token - tokens are 20 characters) |
| `/admin/...` | the two of you | the guest list, addresses, budget, savings, seating |
| `/wall` | the two of you | the projector view for the night |

So the rule is: keep basicauth on the router from step 5, and add a
second router - for `/` and `/i` only - that does not have it.

**`/` has to be matched exactly, not as a prefix.** ``PathPrefix(`/`)``
matches every URL on the domain and would publish the lot; the label
below uses ``Path(`/`)`` for that reason. If you edit it, keep them
straight.

### 6a. Add the public router

Back in **Configuration → Labels**, add these alongside what is already
there. Substitute your own domain, and keep the existing `https-0-…`
router untouched:

```
traefik.http.middlewares.wedding-public-mark.headers.customrequestheaders.X-Wedding-Public=1
traefik.http.routers.wedding-public.rule=Host(`wedding.yourdomain.nz`) && (Path(`/`) || PathPrefix(`/i`) || PathPrefix(`/_next/static`) || Path(`/favicon.ico`))
traefik.http.routers.wedding-public.entrypoints=https
traefik.http.routers.wedding-public.tls=true
traefik.http.routers.wedding-public.tls.certresolver=letsencrypt
traefik.http.routers.wedding-public.priority=100
traefik.http.routers.wedding-public.middlewares=gzip,wedding-public-mark
traefik.http.routers.wedding-public.service=<the service name Coolify generated>
```

Five things here are load-bearing:

- **``Path(`/`)``, not ``PathPrefix(`/`)``.** The landing page is one
  exact URL. As a prefix it would match every page on the domain and
  hand out the guest list, the budget and the savings in one line.
- **`/_next/static` is in the rule.** Without it the invitation loads as
  unstyled HTML: its JavaScript, CSS and fonts all live under that path.
  They are build output and carry no data.
- **`/_next/image` is *not* in the rule, and must never be added.** Next's
  image optimiser fetches whatever same-origin path it is handed, so
  opening it would give an unauthenticated guest a way to read any
  private route that returns an image. The album ships its own
  thumbnails precisely so this stays shut.
- **`priority=100`.** Traefik picks the *longest* rule when priorities
  are equal, and Coolify's generated rule may well be longer than this
  one. Setting the priority explicitly stops that being a coin toss.
- **`middlewares=gzip,wedding-public-mark`** — note what is *not* there:
  the basicauth middleware. That absence is the whole point. If you paste
  it in out of habit, guests get a password prompt they have no password
  for.

`wedding-public-mark` stamps every request this router lets through, and
the app refuses any stamped request that did not land on a public route.
That is what covers the case this kind of rule is most likely to get
wrong - a path like `/i/../guests`, which matches `PathPrefix(/i)` going
in and resolves to `/guests` coming out. The app says no even if the
proxy says yes.

Copy the `service=` value from Coolify's own generated labels - it is the
same service, just a second route to it.

### 6b. Redeploy

Labels only take effect on redeploy.

### 6c. Turn the invitation on

Nothing is visible to guests until you say so, whatever the proxy does.
In the planner, go to **Invitations**, press **Create any missing links**,
then **Take it live**. Until that switch is on, every invitation link
returns a plain 404 - which is also how you take the site down in a hurry
if you ever need to.

### 6d. Verify - both directions

From a device that has never loaded the site, and with a real invitation
link copied from the Invitations page.

**What guests must be able to reach — each of these should be `200`:**

```bash
for path in / "/i/<token>" "/i/<token>/photos"; do
  printf '%-28s ' "$path"
  curl -s -o /dev/null -w '%{http_code}\n' "https://wedding.yourdomain.nz$path"
done
```

- `401` — the public router is not matching. Check the host in the rule.
- `404` — the router works but the site is not live yet; do step 6c.

**What must stay shut — every one of these must be `401`:**

```bash
for path in /admin /admin/guests /admin/households /admin/budget \
            /admin/savings /admin/seating /admin/settings \
            /admin/invitations /admin/photos /admin/timeline/tasks.ics \
            /wall; do
  printf '%-28s ' "$path"
  curl -s -o /dev/null -w '%{http_code}\n' "https://wedding.yourdomain.nz$path"
done
```

If any of those returns `200`, the public router is matching more than it
should — nine times out of ten ``PathPrefix(`/`)`` where the label wants
``Path(`/`)`` — and **your guest list and addresses are on the open
internet**. Remove the `wedding-public` labels, redeploy, and confirm the
whole domain is back to `401` before trying again.

Two more, because they are the cases people miss.

A token that does not exist must not behave differently from one that
does:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://wedding.yourdomain.nz/i/aaaaaaaaaaaaaaaaaaaa
```

`404` is correct.

And the escape attempt. `--path-as-is` matters: without it curl tidies
the `..` away on your own machine and you test nothing.

```bash
curl -s --path-as-is -o /dev/null -w '%{http_code}\n' "https://wedding.yourdomain.nz/i/../admin/guests"
```

`401` or `404` are both correct - either the proxy normalised the path
and demanded a password, or it did not and the app refused. A `200`
means the guest list is public; pull the `wedding-public` labels
immediately.

The landing page carries a quiet "Planning" link to `/admin`. That link
is only a URL - `/admin` is not on the public allowlist, so following it
still meets the password prompt. The check above is what proves it.

## 7. Object storage for photographs

Skip this if you are not using the shared album; everything else works
without it.

Guest photographs do not live in Postgres, so from here on the database
is no longer your entire backup surface - the bucket is the other half.

Create a bucket on any S3-compatible service (Vultr Object Storage sits
next to the VPS; Cloudflare R2 is cheaper and has no egress fee). Then:

1. **Keep the bucket private.** The app streams every photograph itself,
   so nothing ever links directly into the bucket. That is what makes
   hiding a photograph in the planner take effect immediately.
2. **Allow the browser to POST to it.** Guests upload straight to the
   bucket, so it needs a CORS rule:

   ```json
   [
     {
       "AllowedOrigins": ["https://wedding.yourdomain.nz"],
       "AllowedMethods": ["POST"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3000
     }
   ]
   ```

   `POST` only, and one origin. Uploads are presigned and expire in five
   minutes, and the policy caps each file at 8MB, so the bucket refuses
   anything larger regardless of what a browser claims.
3. Set the `S3_*` variables from step 3 and redeploy.
4. Check it: open an invitation, go to the album, add a photograph. If
   it is not configured, the album says so rather than failing silently.

Back the bucket up alongside Postgres. Photographs of the day are the one
thing here that cannot be reconstructed.

## 8. First run

The database starts empty. The app handles that: every page shows an
empty state rather than breaking, and `/admin/settings` is where you set your
names, the wedding date and the savings plan.

**Do not run `pnpm db:seed` against production.** It truncates every
table and inserts the fake wedding. It exists for development only.

Start with:

1. `/admin/settings` — your names, the real wedding date, monthly savings
2. `/admin/guests` — import the real list from CSV
3. `/admin/budget` — replace the seeded items with your real quotes
4. `/admin/timeline` — press "Build the plan from the wedding date"

Then, when you are ready for anyone else to see it:

5. `/admin/invitations/content` — the venue, travel, gifts and the questions
   people always ask
6. `/admin/run-sheet` — tick "Show this moment to guests" on the parts of the
   day guests need, and give each one a guest-facing line. Load-ins and
   supplier calls stay off
7. `/admin/invitations` — create the links, then **Take it live**

## Calendar subscription

`/admin/timeline/tasks.ics` sits behind the same basicauth, so a calendar
client needs credentials in the URL:

```
https://ru:password@wedding.yourdomain.nz/admin/timeline/tasks.ics
```

Most clients accept that form. Some (notably iOS) prefer being given the
username and password separately when adding a subscribed calendar.

## Backups

**Two things now, not one.** Until guest photographs existed the database
was the entire backup surface; it no longer is.

1. **Postgres** holds everything else, including which photograph is
   which. Coolify can schedule backups to S3-compatible storage. By hand:

   ```bash
   docker exec <postgres-container> pg_dump -U postgres postgres | gzip > wedding-$(date +%F).sql.gz
   ```

2. **The photo bucket** holds the images themselves. Turn on versioning
   or a replication rule at the provider. A Postgres backup on its own
   restores a gallery of broken images.

The container still holds no state, so there is nothing to back up on the
VPS itself.

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
| `/admin/guests` or `/admin/budget` loads without a password | The public carve-out is matching too much. Remove the `wedding-public` labels and redeploy **now**, then redo step 6a. Treat as urgent |
| Guests get a password prompt on their link | The public router has the auth middleware on it, or is not matching. Step 6a |
| Invitation links all 404 | The site is not live — Invitations → Take it live (step 6c) |
| One invitation 404s and others work | That household has no link yet, or the token was reissued after it was sent |
| Photo uploads fail | `S3_*` variables missing, or the bucket has no CORS rule for `POST` from your domain (step 7) |
| Photographs show as broken images | Bucket credentials are readable but the objects are gone — check the bucket, not the database |
| Container fails to start after adding labels | `$` in the hash is being interpolated; double them to `$$` |
| PDFs 500 | Fonts missing from the image; check the `src/assets/fonts` COPY in the Dockerfile |
