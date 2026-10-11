# The DJ bridge

Plays the wedding app's dance floor through **djay Pro** on the DJ laptop.

Guests ask for songs and vote from their invitation links; the app keeps
the queue (`src/lib/dj-queue.ts`). This script is the only thing that
touches djay. Every few seconds it asks the app what to do and does it:

| The app says | The bridge does |
|---|---|
| `cue` | adds that song to djay's **Automix queue** (one at a time, so votes keep moving the rest) |
| `skip` | moves on to the next track - the floor voted the song off, or you did |
| `help` | hands a song djay could not find to the fallback, if you set one |

and reports what is **on air** whenever it changes. It reports what it
sees rather than what it did, so you can take over djay by hand at any
moment and the queue follows you.

## How it drives djay

By default **Claude does it, by computer use** (`claude.mjs`). For each
job the bridge sends Claude a screenshot of the Mac and a short task -
"add this song to the Queue", "the floor voted this one off", "what is
playing?" - and Claude clicks and types its way through djay, looking at
the screen after each step. It sees a search that came back empty, a
dialog in the way, or a song that did not land in the Queue, and deals
with it, then answers in two lines the bridge reads: a result
(`CUED`, `NOT_FOUND`, `SKIPPED`, `FAILED`) and the track now playing.

What that means on the night:

- **It is slow by computer standards.** Adding a song or skipping one
  takes tens of seconds; one job runs at a time, skips first. The bridge
  keeps checking in with the app meanwhile, so the planner still shows
  it as connected.
- **djay comes to the front while Claude works**, exactly as it would
  for a person. Treat the laptop as djay's for the night.
- **What is playing is read every 30 seconds** (`DJ_WATCH_SECONDS`) from a
  screenshot, without clicking anything, and after every add or skip.
- **It is billed per use** on your Anthropic API key, with prompt
  caching on. Watch the usage page in the Anthropic Console during a
  rehearsal to see what a night will cost.
- **Song titles are guests' text**, so the task quotes them as data and
  tells Claude never to follow instructions inside one. The couple can
  still remove anything odd from the planner.

`DJ_DRIVER=keys` swaps in the fixed keyboard-shortcut driver below
(fast, but blind), and `DJ_DRIVER=fake` a pretend djay for rehearsing.

## Running it

Once, on the DJ laptop:

```bash
brew install cliclick     # mouse clicks for Claude
cd bridge/dj
npm install               # the Anthropic SDK, for the Claude driver
cp .env.example .env      # then fill in WEDDING_URL, DJ_BRIDGE_TOKEN, ANTHROPIC_API_KEY
```

and give the terminal app you run it from two permissions, then quit
and reopen it (System Settings > Privacy & Security):

- **Accessibility** - for keys and clicks.
- **Screen & System Audio Recording** - for screenshots. Without it the
  screenshots show the desktop and no windows, and Claude is blind.

After that, on the night, from `bridge/dj`:

```bash
node bridge.mjs
```

`/admin/dance-floor` shows "Connected" within a few seconds. A variable
set in the shell still wins over the file, which is handy for a one-off
`DJ_DRIVER=fake node bridge.mjs`.

The bridge keeps the Mac awake while it runs (it starts `caffeinate`
itself, tied to its own process, so nothing is left holding the Mac
awake once it stops). `DJ_KEEP_AWAKE=0` turns that off. Also set the
lock screen and screen saver to never, keep the laptop plugged in, and
turn on Do Not Disturb: nothing can be clicked behind a lock screen, and
a notification that takes focus gets in the way.

djay should be in **Automix** with Apple Music signed in.

### Trying it without djay

```bash
DJ_DRIVER=fake FAKE_SONG_SECONDS=20 node bridge.mjs
```

A pretend djay: each song "plays" for 20 seconds, Skip moves on at once,
and it plays "DJ's choice N" when its queue runs dry. A song with
"missing" in the title is never found, so the fallback path gets
exercised too. Run it against a local `pnpm dev` with requests open and
two phones on two invitation links.

## The keystroke driver (`DJ_DRIVER=keys`)

The alternative to Claude: fixed keystrokes, no screenshots, no API key,
near-instant - and blind, so it cannot tell when a step did nothing.
It only needs Accessibility, and nothing installed. Calibrate it before
trusting it:

djay has no API and no AppleScript dictionary, so the bridge drives it
the way a person would: keystrokes and clicks through macOS
accessibility. **The steps in `djay.config.json` are a starting guess
and have not been run against djay.** The right ones depend on your djay
version and its keyboard shortcuts (djay > Settings > Keyboard
Shortcuts), so they have to be checked on this laptop:

**Start from djay's own shortcuts.** djay > Settings > Keyboard
Shortcuts can export them (a `.djayKeyBindings` file: each `#N` is a macOS
key code). Two of them do the bridge's main jobs with no clicking at all,
and the config already uses them:

| Shortcut | djay action | Used for |
|---|---|---|
| ⌘↩ | `musicLibrary.markSelectedSongs` | `cue`: add the selected track to the Queue |
| ⇧⌘↩ | `mixer.transitionActiveToInactive` | `skip`: mix into the next deck |
| ⌘K | `musicLibrary.focusQueue` | checking the Queue by hand |
| ⇧⌘A | `application.automix` | Automix on and off |

There is no shortcut for the search field in that file, and none for
reading the decks, which a shortcut cannot do. So check the `cue` steps
by hand, in djay, before trusting them:

- ⌘F, type a song, wait for the Apple Music results. Does ↓ highlight
  the first result? Does ⌘↩ then put it in the Queue (⌘K to look)?
- With Automix playing, does ⇧⌘↩ mix into the next track?

If ⌘F does nothing, find the search field with the probe below and use
a `click`-style step, or bind a key to it in djay's shortcuts. The probe
is also the only way to set up `nowPlaying`.

1. **See what accessibility can see.** With djay open:

   ```bash
   node bridge.mjs probe > djay-tree.txt
   ```

   One line per element: role, name, description, value. Look for the
   Skip button, the library search field, and the text showing each
   deck's track title and artist.

2. **`cue`** - the steps that get a song into the Automix queue. The
   guess: focus search (Cmd-F), paste `{query}` (title and artist), wait
   for Apple Music results, select the first, Cmd-Return to add the
   selection to the queue, Escape. Change the steps until a song lands
   at the end of the Automix queue every time.

3. **`skip`** - ⇧⌘↩ (`mixer.transitionActiveToInactive`), so the floor
   gets a mix into the next song rather than a hard cut. If you would
   rather it pressed Automix's own Skip button, use
   `{ "click": "Skip" }` with whatever name the probe shows for it.

4. **`nowPlaying`** - reading the decks. `null` until calibrated, and
   while it is `null` the bridge never reports what is on air: mark
   songs on air from `/admin/dance-floor` by hand, and vote-to-skip only
   works once a song is marked. Set it to
   `{ "applescript": "..." }`, a script that runs inside
   `tell process "djay Pro"` and returns the playing deck's title and
   artist on two lines (or `""` for nothing). `djay-tree.txt` says
   which elements hold them.

Step kinds: `{ "activate": true }`, `{ "keystroke": "f", "using":
["command"] }`, `{ "key": "down" }` (return, tab, space, delete, escape,
arrows), `{ "paste": "{query}" }`, `{ "click": "Skip" }`,
`{ "delay": 0.5 }`, `{ "applescript": "..." }`.

**This is a good job to hand to Claude.** In a session with computer
use on this Mac, ask it to run the probe, try the cue and skip steps
against djay, and adjust `djay.config.json` until a test song reliably
lands in the Automix queue and Skip reliably skips.

## When djay cannot find a song

A cue can fail two ways:

- **Loudly** - the steps errored. The song goes to "Needs a hand".
- **Silently** - the keystrokes ran but nothing was added, which looks
  exactly like success from outside. The app notices when two other
  songs have started since djay was given it, and moves it to "Needs a
  hand" too (`staleCues`). It counts songs rather than minutes, so the
  speeches do not trigger it.

With the Claude driver a `NOT_FOUND` already means Claude looked at
the screen and could not find it, so there is no further fallback by
default. With the keystroke driver, `DJ_FALLBACK_COMMAND` can name a
command to run once per song needing a hand, with the prompt from
`fallback-prompt.md` on stdin and `SONG_TITLE` and `SONG_ARTIST` in the
environment; the **last line** of its output decides: `CUED` marks the
song cued, `NOT_FOUND` gives up on it, anything else leaves it under
"Needs a hand". While it runs the bridge presses nothing else.

Without a fallback command, songs that need a hand wait on
`/admin/dance-floor`, where "It's in djay's queue" and "Give up" settle
them.

## Environment

| Variable | Default | |
|---|---|---|
| `WEDDING_URL` | - | the app |
| `DJ_BRIDGE_TOKEN` | - | the same value as the server's |
| `DJ_DRIVER` | `claude` | `claude`, `keys` or `fake` |
| `ANTHROPIC_API_KEY` | - | for the Claude driver |
| `DJ_WATCH_SECONDS` | `30` | Claude driver: how often it reads the decks |
| `DJ_APP` | first app named `djay…` | Claude driver: which app to bring forward |
| `DJ_CONFIG` | `./djay.config.json` | keystroke driver: the calibrated steps |
| `DJ_POLL_MS` | `3000` | how often to ask |
| `DJ_FALLBACK_COMMAND` | none | see above |
| `FAKE_SONG_SECONDS` | `20` | the fake driver's song length |
| `DJ_KEEP_AWAKE` | on | `0` lets the Mac sleep while the bridge runs |

All of these can live in `.env` beside the script (see `.env.example`).
