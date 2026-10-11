# The DJ bridge

Plays the wedding app's dance floor through **djay Pro** on the DJ laptop.

Guests ask for songs and vote from their invitation links; the app keeps
the queue (`src/lib/dj-queue.ts`). This script is the only thing that
touches djay. Every few seconds it asks the app what to do and does it:

| The app says | The bridge does |
|---|---|
| `cue` | adds that song to djay's **Automix queue** (one at a time, so votes keep moving the rest) |
| `skip` | presses **Skip** - the floor voted the song off, or you did |
| `help` | hands a song djay could not find to the fallback (Claude, below) |

and reports what is **on air** whenever it changes. It reports what it
sees rather than what it did, so you can take over djay by hand at any
moment and the queue follows you.

Plain Node 20+, no dependencies, no build step.

## Running it

Once, put the settings in a `.env` beside the script (it is gitignored):

```bash
cd bridge/dj
cp .env.example .env      # then fill in WEDDING_URL and DJ_BRIDGE_TOKEN
```

After that, on the night, from `bridge/dj`:

```bash
node bridge.mjs
```

`/admin/dance-floor` shows "Connected" within a few seconds. A variable
set in the shell still wins over the file, which is handy for a one-off
`DJ_DRIVER=fake node bridge.mjs`.

The bridge keeps the Mac awake while it runs (it starts `caffeinate`
itself, tied to its own process, so nothing is left holding the Mac
awake once it stops). `DJ_KEEP_AWAKE=0` turns that off. Keep the laptop
plugged in and on Do Not Disturb all the same: a notification that takes
focus swallows the bridge's keystrokes.

The terminal it runs in needs **Accessibility** permission (System
Settings > Privacy & Security > Accessibility), or every keystroke fails
with "not allowed assistive access". djay should be in **Automix** with
Apple Music signed in.

### Trying it without djay

```bash
DJ_DRIVER=fake FAKE_SONG_SECONDS=20 node bridge.mjs
```

A pretend djay: each song "plays" for 20 seconds, Skip moves on at once,
and it plays "DJ's choice N" when its queue runs dry. A song with
"missing" in the title is never found, so the fallback path gets
exercised too. Run it against a local `pnpm dev` with requests open and
two phones on two invitation links.

## Calibrating against djay - do this before the night

djay has no API and no AppleScript dictionary, so the bridge drives it
the way a person would: keystrokes and clicks through macOS
accessibility. **The steps in `djay.config.json` are a starting guess
and have not been run against djay.** The right ones depend on your djay
version and its keyboard shortcuts (djay > Settings > Keyboard
Shortcuts), so they have to be checked on this laptop:

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

3. **`skip`** - pressing Automix's Skip. The guess clicks a button whose
   name or description is "Skip". If djay names it differently, change
   it; if you map a key to it in djay's shortcuts, use a `key` step
   instead, which is faster.

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

Then the fallback. Set `DJ_FALLBACK_COMMAND` to a command that runs
Claude with computer use on this Mac. The bridge runs it once per song,
with the prompt from `fallback-prompt.md` on stdin and `SONG_TITLE` and
`SONG_ARTIST` in the environment, and reads the **last line** of its
output: `CUED` marks the song cued, `NOT_FOUND` gives up on it, anything
else leaves it under "Needs a hand" for you. While the fallback runs the
bridge presses nothing, so the two never fight over the keyboard; it
keeps reporting what is on air.

Without a fallback command, songs that need a hand wait on
`/admin/dance-floor`, where "It's in djay's queue" and "Give up" settle
them.

## Environment

| Variable | Default | |
|---|---|---|
| `WEDDING_URL` | - | the app |
| `DJ_BRIDGE_TOKEN` | - | the same value as the server's |
| `DJ_DRIVER` | `djay` | or `fake` |
| `DJ_CONFIG` | `./djay.config.json` | the calibrated steps |
| `DJ_POLL_MS` | `3000` | how often to ask |
| `DJ_FALLBACK_COMMAND` | none | see above |
| `FAKE_SONG_SECONDS` | `20` | the fake driver's song length |
| `DJ_KEEP_AWAKE` | on | `0` lets the Mac sleep while the bridge runs |

All of these can live in `.env` beside the script (see `.env.example`).
