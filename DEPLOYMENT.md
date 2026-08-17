# Deploying The Wedding Ledger

Coolify on your Vultr VPS, behind Traefik. Coolify builds the Dockerfile
straight from GitHub — there is no CI pipeline and no image registry,
because this app inlines no build-time secrets and needs neither.

> **The app now authenticates its own planner.** A passkey each, with an
> app password behind them as the way in the first time and the way back
> if a phone goes in a lake. It needs exactly one thing from you:
> **`APP_PASSWORD` must be set before the app is reachable** (step 3). It
> is not optional and there is no default - with no password and no
> passkey registered, `/login` says so and nobody can get in, which is
> the right way round for that failure.
>
> Earlier versions of this app had no authentication at all and leaned
> entirely on Traefik basicauth. That is now a **second** lock rather
> than the only one, and step 6 is where you decide whether to keep it.

> **Two paths are deliberately public**: `/` (the landing page) and
> everything under `/i` (the invitations). Everything else, the planner
> included, must not be. The app enforces that itself, in one place, and
> **step 5d is not optional** - it is the step that tells you whether it
> is really doing so.
>
> The planner lives under **`/admin`**. That is a convenience, not a
> security boundary: the rule stays "private by default, public by
> exception", so a page added outside `/admin` tomorrow is still behind
> the sign-in, and a rule that protected only `/admin` would be a
> mistake.

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
| `APP_PASSWORD` | **yes** | the planner's password. `openssl rand -base64 24` |
| `APP_ORIGIN` | rarely | e.g. `https://wedding.yourdomain.nz`. Only if passkeys complain about the domain |
| `S3_BUCKET` | photos only | the bucket guest photographs go in |
| `S3_ACCESS_KEY_ID` | photos only | an access key scoped to that bucket |
| `S3_SECRET_ACCESS_KEY` | photos only | its secret |
| `S3_ENDPOINT` | usually | e.g. `https://ap-south-1.vultrobjects.com`. Omit only on real AWS |
| `S3_REGION` | no | defaults to `us-east-1`, which non-AWS services ignore |
| `S3_FORCE_PATH_STYLE` | no | defaults to on; set `false` only if your provider needs virtual-host style |

`NODE_ENV`, `PORT` and `HOSTNAME` are baked into the image.

`APP_PASSWORD` is the one that has to be right before anyone can reach
the domain. It is a runtime variable like the rest, so changing it is a
redeploy - which is deliberate: a browser someone else is holding cannot
change the credential that would lock them out.

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

## 5. The planner's own sign-in — do not skip this

The app authenticates the planner itself. There is nothing to configure
beyond `APP_PASSWORD` from step 3, but there *is* something to check, and
checking it is the step that actually protects you.

### 5a. Confirm the password is set

`APP_PASSWORD` is a runtime variable, so it takes effect on deploy. Open
`https://wedding.yourdomain.nz/login`. You should get a password box.

If instead it says **"No way in yet"**, the variable is missing or empty.
That page is the app telling you nobody can sign in - including you. Set
it in Coolify and redeploy.

### 5b. Sign in

Type the password. You land on the planner at `/admin`.

There are no accounts and no usernames: one password, shared by the two
of you, exactly like the basicauth it replaces. What makes it safe to be
a password a human chose is that the app counts attempts - eight per
source per fifteen minutes - and that you are about to stop using it.

### 5c. Add a passkey each

Go to **Settings → Access**, press **Add a passkey**, name it ("Malin's
iPhone"), and let the device ask for Face ID, Touch ID or your screen
lock. Do it on each phone and laptop the two of you plan on.

From then on signing in is one tap and the password is the spare key in
the drawer. Removing a passkey on that page also signs out the browsers
that used it, so a lost phone is one action rather than two.

**Keep the password somewhere you will still have it if every passkey is
gone.** Passkeys live on devices; the password is what survives losing
them all. If you would rather not rely on that, register a passkey on a
hardware security key as well and keep it with the marriage licence.

### 5d. Verify — this is the step that actually protects you

From a machine or browser that has never loaded the site (a phone on
mobile data is ideal, since your laptop now holds a session).

**What must stay shut.** Each of these must be a `307` to `/login`:

```bash
for path in /admin /admin/guests /admin/households /admin/budget \
            /admin/savings /admin/seating /admin/settings /admin/access \
            /admin/invitations /admin/photos /wall; do
  printf '%-28s ' "$path"
  curl -s -o /dev/null -w '%{http_code}\n' "https://wedding.yourdomain.nz$path"
done
```

- `307` — correct, the sign-in is live.
- `200` — **the planner is wide open.** Every guest address, the budget
  and the savings are public. Remove the domain in Coolify and work out
  why before putting it back.

**Check the bodies, not just the statuses.** A redirect that still
carries the page in its body would look perfectly fine above and be a
leak. This must print a small number, not a large one:

```bash
curl -s https://wedding.yourdomain.nz/admin/guests | wc -c
```

Tens of bytes is right. Tens of thousands means the page rendered.

**What must stay reachable** - `/` and the invitations, which have no
sign-in of their own, and the health check, which Coolify probes from
inside Docker where there is no cookie to present:

```bash
for path in / /login /api/health; do
  printf '%-28s ' "$path"
  curl -s -o /dev/null -w '%{http_code}\n' "https://wedding.yourdomain.nz$path"
done
```

All three must be `200`.


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

Every one of those is already the case: the app serves `/` and `/i`
without a session and refuses everything else. **If you are happy with
one lock, you are done - skip to step 6c and turn the invitation on.**

The rest of this step is the second lock, and it is optional. Decide
which you want:

| | Traefik does | You get |
|---|---|---|
| **One lock** (simpler) | one router, no basicauth | the app is the boundary. Guests reach `/` and `/i`; you sign in for the rest |
| **Two locks** (belt and braces) | basicauth on everything, minus a carve-out for `/` and `/i` | a password prompt in front of the app as well, and a path rule you have to get right |

The honest trade: the second lock guards against a bug in the first, but
it is also the part most likely to be *misconfigured*, and a carve-out
that matches too much publishes the guest list. If you set it up, do
6d afterwards - that is the step that tells you which of the two you
have.

Basicauth also costs you something concrete: the calendar subscription
then needs both credentials in one URL, and some clients will not do it.

### 6a. Two locks: basicauth, then carve `/` and `/i` back out

Skip this whole subsection if you chose one lock.

First put basicauth on the whole domain. Generate a hash - the password
never leaves your machine:

```bash
htpasswd -nbB ru 'choose-a-strong-password'
```

No `htpasswd` installed? `docker run --rm httpd:alpine htpasswd -nbB ru 'choose-a-strong-password'`.
Run it again for Malin and combine both, comma-separated.

Then find the router name, because **Coolify generates it and you do
not**. Application → **Configuration → Labels** already shows something
like `traefik.http.routers.https-0-wc04wo4ow4scokgsw8wow4s8.middlewares=gzip`.
Copy that router id. A label pointing at a router name you invented
attaches to nothing, the site stays open, and nothing warns you.

Add the middleware and attach it - note the second label **appends**, so
do not drop `gzip`:

```
traefik.http.middlewares.wedding-auth.basicauth.users=ru:$2y$05$...,malin:$2y$05$...
traefik.http.routers.https-0-wc04wo4ow4scokgsw8wow4s8.middlewares=gzip,wedding-auth
```

If the hash appears mangled or the container fails to start, the `$`
characters are being interpolated - double each one (`$$2y$$05$$...`).

Now the public router, which carves the guest paths back out. Substitute
your own domain and keep the generated `https-0-…` router untouched:

Back in **Configuration → Labels**, add these alongside what is already
there. Substitute your own domain, and keep the existing `https-0-…`
router untouched:

```
traefik.http.middlewares.wedding-public-mark.headers.customrequestheaders.X-Wedding-Public=1
traefik.http.routers.wedding-public.rule=Host(`wedding.yourdomain.nz`) && (Path(`/`) || Path(`/login`) || PathPrefix(`/i`) || PathPrefix(`/_next/static`) || Path(`/favicon.ico`) || Path(`/icon.svg`) || Path(`/apple-icon.png`))
traefik.http.routers.wedding-public.entrypoints=https
traefik.http.routers.wedding-public.tls=true
traefik.http.routers.wedding-public.tls.certresolver=letsencrypt
traefik.http.routers.wedding-public.priority=100
traefik.http.routers.wedding-public.middlewares=gzip,wedding-public-mark
traefik.http.routers.wedding-public.service=<the service name Coolify generated>
```

Six things here are load-bearing:

- **``Path(`/`)``, not ``PathPrefix(`/`)``.** The landing page is one
  exact URL. As a prefix it would match every page on the domain and
  hand out the guest list, the budget and the savings in one line.
- **`/login` is in the rule.** The app's own sign-in has to be reachable
  by someone who has not signed in yet. Left out, you meet the basicauth
  prompt first and type two passwords to reach the planner.
- **`/_next/static` and the icons are in the rule.** Without the first
  the invitation loads as unstyled HTML - its JavaScript, CSS and fonts
  all live under that path. Without the icons every public page shows a
  broken favicon. All of it is build output and carries no data.
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
wrong - a path like `/i/../admin/guests`, which matches `PathPrefix(/i)`
going in and resolves to `/admin/guests` coming out. The app says no even
if the proxy says yes.

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
for path in / /login "/i/<token>" "/i/<token>/photos"; do
  printf '%-28s ' "$path"
  curl -s -o /dev/null -w '%{http_code}\n' "https://wedding.yourdomain.nz$path"
done
```

- `401` — the public router is not matching, so basicauth is still in
  front of these. Check the host in the rule.
- `404` — the router works but the site is not live yet; do step 6c.

**What must stay shut.** With two locks these are `401`; with one lock
they are the `307` you already checked in step 5d. Either is correct.
**`200` is not.**

```bash
for path in /admin /admin/guests /admin/households /admin/budget \
            /admin/savings /admin/seating /admin/settings /admin/access \
            /admin/invitations /admin/photos /admin/timeline/tasks.ics \
            /wall; do
  printf '%-28s ' "$path"
  curl -s -o /dev/null -w '%{http_code}\n' "https://wedding.yourdomain.nz$path"
done
```

If any of those returns `200`, the public router is matching more than it
should — nine times out of ten ``PathPrefix(`/`)`` where the label wants
``Path(`/`)`` — and **your guest list and addresses are on the open
internet**. Remove the `wedding-public` labels, redeploy, and confirm
before trying again.

Three more, because they are the cases people miss.

A token that does not exist must not behave differently from one that
does:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://wedding.yourdomain.nz/i/aaaaaaaaaaaaaaaaaaaa
```

`404` is correct.

The escape attempt. `--path-as-is` matters: without it curl tidies the
`..` away on your own machine and you test nothing.

```bash
curl -s --path-as-is -o /dev/null -w '%{http_code}\n' "https://wedding.yourdomain.nz/i/../admin/guests"
```

`401`, `404` or `307` are all correct - either Traefik normalised the
path and demanded a password, or it did not and the app refused. A `200`
means the guest list is public; pull the `wedding-public` labels
immediately.

And the one that a status code alone will not catch: a stamped request
for a private path must be refused *with an empty body*, not refused in
the headers while the page rides along underneath.

```bash
curl -s -H 'X-Wedding-Public: 1' https://wedding.yourdomain.nz/admin/guests | wc -c
```

Tens of bytes is right. Tens of thousands means something rendered the
guest list before refusing to admit it.

The landing page carries a quiet "Planning" link to `/admin`. That link
is only a URL - following it meets the sign-in (and the password prompt,
if you kept one). The checks above are what prove it.


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

1. `/admin/access` — add a passkey for each device, so you stop typing the
   password (step 5c)
2. `/admin/settings` — your names, the real wedding date, monthly savings
3. `/admin/guests` — import the real list from CSV
4. `/admin/budget` — replace the seeded items with your real quotes
5. `/admin/timeline` — press "Build the plan from the wedding date"

Then, when you are ready for anyone else to see it:

6. `/admin/invitations/content` — the venue, travel, gifts and the questions
   people always ask
7. `/admin/run-sheet` — tick "Show this moment to guests" on the parts of the
   day guests need, and give each one a guest-facing line. Load-ins and
   supplier calls stay off
8. `/admin/invitations` — create the links, then **Take it live**

## Calendar subscription

A calendar client cannot use a passkey, cannot fill in a form and cannot
hold a session - it fetches one URL every few hours forever. So the feed
at `/admin/timeline/tasks.ics` is the **one** path that also accepts the
app password in the URL:

```
https://ledger:APP_PASSWORD@wedding.yourdomain.nz/admin/timeline/tasks.ics
```

The username is ignored - there is one credential here, so put anything
before the colon. Most clients accept that form; some (notably iOS)
prefer being given the username and password separately when adding a
subscribed calendar.

No other path accepts a password this way, deliberately: every URL that
does is another one a password can be guessed at.

**If you kept basicauth (two locks), this URL needs both credentials and
there is nowhere to put the second.** Either subscribe from inside the
network, or add a Traefik carve-out for this one exact path - or accept
that the calendar feed is the price of the second lock. It is the one
concrete thing basicauth costs you.

Whoever holds this URL holds the app password, so treat it like the
password itself: it goes in your own calendar client, not in a shared
calendar or a group chat.

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
| `/login` says "No way in yet" | `APP_PASSWORD` is unset or empty. Set it in Coolify and redeploy (step 3) |
| `/admin/guests` returns `200` to a stranger | **Urgent.** Remove the domain in Coolify. If you added the `wedding-public` labels, the carve-out is matching too much - pull them first, then redo step 6a |
| Signing in loops back to `/login` | The session cookie is not being kept. The site must be on `https` in production; a proxy stripping `Set-Cookie` will do this too |
| Passkeys refuse to register, or say the domain is wrong | The app is reading the wrong host from the forwarded headers. Set `APP_ORIGIN` to exactly the origin in the address bar (step 3) |
| "Too many attempts" and it is you | Eight password guesses per source per fifteen minutes. Wait it out, or sign in with a passkey, which is not throttled |
| Locked out entirely - no passkey works | Sign in with `APP_PASSWORD`, then remove the stale passkeys on `/admin/access`. If the password is lost too, set a new `APP_PASSWORD` and redeploy |
| Calendar subscription stops working | The app password changed, or you added basicauth in front of it (see the calendar section) |
| Guests get a password prompt on their link | You kept basicauth and the public router has the auth middleware on it, or is not matching. Step 6a |
| Invitation links all 404 | The site is not live — Invitations → Take it live (step 6c) |
| One invitation 404s and others work | That household has no link yet, or the token was reissued after it was sent |
| Photo uploads fail | `S3_*` variables missing, or the bucket has no CORS rule for `POST` from your domain (step 7) |
| Photographs show as broken images | Bucket credentials are readable but the objects are gone — check the bucket, not the database |
| Container fails to start after adding labels | `$` in the hash is being interpolated; double them to `$$` |
| PDFs 500 | Fonts missing from the image; check the `src/assets/fonts` COPY in the Dockerfile |
