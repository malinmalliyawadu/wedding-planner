# The DJ bridge

Plays the wedding app's dance floor through **djay Pro** on the DJ laptop.

Guests ask for songs and vote from their invitation links; the app keeps
the queue (`src/lib/dj-queue.ts`). This script is the only thing that
touches djay. Every few seconds it asks the app what to do and does it:

| The app says | The bridge does |
|---|---|
| `cue` | loads that song onto djay's **idle deck**, so Automix plays it next (one at a time, so votes keep moving the rest) |
| `skip` | moves on to the next track - the floor voted the song off, or you did |

A song djay cannot find is dropped from the queue; whoever wanted it can
ask again.

and reports what is **on air** whenever it changes. It reports what it
sees rather than what it did, so you can take over djay by hand at any
moment and the queue follows you.

## What is on air: macOS Now Playing

djay tells macOS what it is playing, the same as Music or Spotify do -
it is the track Control Center and the lock screen show. The bridge
listens to that (`nowplaying.mjs`) and reports each change the moment
it happens. It is the best source there is: the title as djay knows
it, with no screenshot to misread, no window that has to be in view,
and nothing billed. Apple closed this to ordinary programs in macOS
15.4, so it is read through
[`media-control`](https://github.com/ungive/media-control)
(`brew install media-control`), which still can.

- Only djay counts (bundle ids starting `com.algoriddim.`, or
  `DJ_NOW_PLAYING_BUNDLE`). A video someone plays in a browser on the
  laptop takes over Now Playing too; it is ignored, and logged once.
- A pause is not reported as "nothing on air", so a moment between
  decks never ends a song that is about to carry on. A song ends when
  the next one starts.
- While it is in use, the driver does not read the decks at all, and
  what Claude says is playing at the end of an add or skip is not used
  either: one source, so two spellings of a title cannot argue about
  whether the song changed.

### Skipping: the media key

A skip is the ⏭ key: macOS's own next-track, instant and free, where
the driver finding djay's button takes Claude tens of seconds. It is
pressed the moment the app asks, even while Claude is in the middle of
adding a song - it touches no screen, so it waits for nothing.

With `media-control` it is `media-control next-track`, pressed only
while djay holds Now Playing, so a browser video on the laptop is never
what gets skipped; if the song is still on air eight seconds later the
key did not take, and the driver skips it the long way (up to two more
tries). Without `media-control` the bridge posts the key itself, as the
keyboard would, but blind: it cannot tell who holds Now Playing. On the
night that is djay; if it was not, the song is still on air and the
driver skips it, after a look at the decks to see whether it went (30
seconds).

**Check it at the rehearsal**, because it is the part that depends on
djay: with Automix playing, run `media-control get` and see djay's track
in it, then watch `media-control stream` through a mix to see that the
track changes when the new one comes in. Then, with Automix playing, run
`media-control next-track` and listen: djay should move on to the next
song. If it does nothing, skips still work through the driver, just
slowly. If djay does not show up there
at all, set `DJ_NOW_PLAYING=driver` and the driver reads the decks
instead (below). Without `media-control` installed the bridge says so
at startup and does the same by itself.

## How it drives djay

By default **Claude does it, by computer use** (`claude.mjs`). For each
job the bridge sends Claude a screenshot of the Mac and a short task -
"play this song next", "the floor voted this one off", "what is
playing?" - and Claude clicks and types its way through djay, looking at
the screen after each step. It sees a search that came back empty, a
dialog in the way, or a song that did not land on the deck, and deals
with it, then answers in lines the bridge reads: a result
(`CUED`, `NOT_FOUND`, `SKIPPED`, `FAILED`), the track now playing, and
how long it has left.

What that means on the night:

- **It is slow by computer standards.** Adding a song takes tens of
  seconds, and so does a skip when the media key cannot do it (above);
  one job runs at a time, skips first. The bridge
  keeps checking in with the app meanwhile, so the planner still shows
  it as connected.
- **djay comes to the front while Claude works**, exactly as it would
  for a person. Treat the laptop as djay's for the night.
Only when Now Playing is not in use (see above):

- **What is playing is read off a picture of djay's window**, without
  clicking anything, and after every add or skip. The picture is of
  djay's window alone, which the Mac draws whole even with another app
  in front of it, so the reading carries on when someone opens a browser
  on the laptop; if djay has no window on this screen (minimised, or full
  screen in another Space) it falls back to the whole screen and says so.
  Reading carries on while Claude is busy adding or skipping, too - a
  song can end in the middle of a forty-second add.
- **Each reading takes the time left as well as the title**, so the
  bridge knows when the song is due to end. It reads every 30 seconds
  (`DJ_WATCH_SECONDS`) through the song, then every 5 seconds
  (`DJ_WATCH_FAST_SECONDS`) from 20 seconds before the end
  (`DJ_WATCH_LEAD_SECONDS`, because Automix mixes out early) until it sees
  the next one. The change reaches guests' phones within seconds, and
  the next request is loaded as soon as this one is on air. If the time
  left cannot be read, a request waiting on the idle deck is read every
  5 seconds instead, as the only other sign that a change is near.
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
brew install media-control  # reads macOS Now Playing, for what is on air
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

djay should be in **Automix** with Apple Music signed in, started on a
playlist long enough to fill the gaps between requests. Each request is
loaded onto the idle deck (⌘← for deck 1, ⌘→ for deck 2, or the
library's right-click menu), replacing
whatever Automix had lined up there, and Automix mixes into it when the
playing track ends. Only a single song is ever picked from the search
results: opening an artist, album or playlist there replaces the list
Automix plays from, so the drivers are told never to. The search is
cleared after every cue, by keyboard: ⌘F to focus it, then Esc, which
clears any macOS search field (⌘A and Delete if it does not). The app only hands over the next request once that
one is on air, so a waiting request is never loaded over. djay's Queue
(⌘↩) is not used: Automix does not play from it.

### Trying it without djay

```bash
DJ_DRIVER=fake FAKE_SONG_SECONDS=20 node bridge.mjs
```

A pretend djay: each song "plays" for 20 seconds, Skip moves on at once,
and it plays "DJ's choice N" when its queue runs dry. A song with
"missing" in the title is never found, so a failed cue gets
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
| ⌘← / ⌘→ | `musicLibrary.load1` / `load2` | the Claude driver's `cue`: load onto whichever deck is idle |
| ⌘K | `musicLibrary.focusQueue` | checking the Queue by hand |
| ⇧⌘A | `application.automix` | Automix on and off |

There is no shortcut for the search field in that file, and none for
reading the decks, which a shortcut cannot do. So check the `cue` steps
by hand, in djay, before trusting them:

- ⌘F, type a song, wait for the Apple Music results. Does ↓ highlight
  the first *song*? If the results list artists, albums or playlists
  first, ↓ lands on one of those, and opening one replaces the list
  Automix is playing from - change the steps so only a song is ever
  selected. Does ⌘↩ then put it in the Queue (⌘K to look)?
- Then ⌘F and Esc: does the search field empty and the library go back
  to the list it was showing?
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
   for Apple Music results, select the first song, Cmd-Return to add
   the selection to the queue, then Cmd-F and Escape to clear the
   search. djay has no binding of its own for clearing it; Escape in a
   focused macOS search field is the platform's. Change the steps until a song lands
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

It is dropped from the queue (`unavailable`, "not found" in the
planner's history), and whoever wanted it can simply ask again. Nothing
is held back for someone to hunt for, so the next request goes straight
to djay. A cue can fail two ways:

- **Loudly** - the driver said it could not find it (`NOT_FOUND`) or
  its steps errored.
- **Silently** - the keystrokes ran but nothing was added, which looks
  exactly like success from outside. The app notices when two other
  songs have started since djay was given it, and drops it then
  (`staleCues`). It counts songs rather than minutes, so the speeches do
  not trigger it. If it was on a deck after all and comes on later, it
  is added back as the DJ's own choice.

## Environment

| Variable | Default | |
|---|---|---|
| `WEDDING_URL` | - | the app |
| `DJ_BRIDGE_TOKEN` | - | the same value as the server's |
| `DJ_DRIVER` | `claude` | `claude`, `keys` or `fake` |
| `ANTHROPIC_API_KEY` | - | for the Claude driver |
| `DJ_NOW_PLAYING` | `native` | `native`: on air from macOS Now Playing; `driver`: the driver reads the decks |
| `DJ_NOW_PLAYING_BUNDLE` | `com.algoriddim.` | whose Now Playing counts |
| `DJ_WATCH_SECONDS` | `30` | Claude driver, without Now Playing: how often it reads the decks |
| `DJ_WATCH_FAST_SECONDS` | `5` | how often instead as a song ends (or while a request waits, when the time left is unknown) |
| `DJ_WATCH_LEAD_SECONDS` | `20` | how long before a song's end to start reading often |
| `DJ_APP` | first app named `djay…` | Claude driver: which app to bring forward |
| `DJ_CONFIG` | `./djay.config.json` | keystroke driver: the calibrated steps |
| `DJ_POLL_MS` | `3000` | how often to ask |
| `FAKE_SONG_SECONDS` | `20` | the fake driver's song length |
| `DJ_KEEP_AWAKE` | on | `0` lets the Mac sleep while the bridge runs |

All of these can live in `.env` beside the script (see `.env.example`).
