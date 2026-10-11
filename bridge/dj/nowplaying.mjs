import { execFile, spawn } from "node:child_process";

/**
 * What is on air, from macOS's own Now Playing - the same track Control
 * Center and the lock screen show - rather than from anyone reading
 * djay's screen.
 *
 * djay hands its track to the system itself, so this is the title as djay
 * knows it, the moment it changes, at no cost: no screenshot to misread,
 * no window that has to be in view, no model call per look. Apple closed
 * the framework behind it to ordinary programs in macOS 15.4, so it is
 * read through `media-control` (`brew install media-control`), which still
 * can. `media-control stream` prints a line whenever anything changes.
 *
 * Only djay's own entries count (bundle ids `com.algoriddim.*`, or
 * DJ_NOW_PLAYING_BUNDLE): a video someone plays in a browser on the
 * laptop takes over Now Playing too, and is not on the speakers.
 *
 * A pause is not "nothing on air". It is reported as nothing at all, so a
 * moment's pause between decks never ends a song that is about to carry
 * on; what ends a song is the next one starting.
 *
 * It also presses the system's own next-track, the media key, which is
 * how the bridge skips: instant and free, where asking the driver to
 * find the button takes Claude tens of seconds. The key goes to whichever
 * app holds Now Playing, so it is only pressed while that is djay - the
 * browser video above must never be the thing that gets skipped.
 */

const RESTART_MS = 5000;

function run(...args) {
  return new Promise((resolve, reject) => {
    execFile("media-control", args, { timeout: 10_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

/**
 * Starts listening, and resolves to `{ stop }` - or to null when
 * media-control is not installed, saying why, so the bridge can fall back
 * to reading the decks itself. `onReading` gets `{ onAir, seenAt }` for
 * every change djay makes.
 */
export async function nativeNowPlaying({ log, onReading, bundlePrefix = "com.algoriddim." }) {
  const isDjay = (info) => typeof info?.bundleIdentifier === "string" && info.bundleIdentifier.startsWith(bundlePrefix);

  let first;
  try {
    first = JSON.parse((await run("get")).trim() || "null");
  } catch (error) {
    log(
      error.code === "ENOENT"
        ? "media-control is not installed (brew install media-control): reading the decks with the driver instead"
        : `could not read Now Playing (${error.message}): reading the decks with the driver instead`,
    );
    return null;
  }
  if (first && !isDjay(first)) {
    log(`Now Playing is showing ${first.bundleIdentifier ?? "another app"}, not djay: only djay's tracks are reported`);
  }

  const ignored = new Set();
  let state = first ?? {};
  let child = null;
  let stopped = false;

  function handle(info) {
    if (!info || typeof info.title !== "string" || info.title.trim() === "") return;
    if (!isDjay(info)) {
      if (info.bundleIdentifier && !ignored.has(info.bundleIdentifier)) {
        ignored.add(info.bundleIdentifier);
        log(`Now Playing: ignoring ${info.bundleIdentifier}, which is not djay`);
      }
      return;
    }
    if (info.playing === false) return;
    const artist = typeof info.artist === "string" && info.artist.trim() !== "" ? info.artist.trim() : null;
    onReading({ onAir: { title: info.title.trim(), artist }, seenAt: Date.now() });
  }

  function start() {
    // --no-diff: every line is the whole state, not just what changed.
    child = spawn("media-control", ["stream", "--no-diff"], { stdio: ["ignore", "pipe", "inherit"] });
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        const payload = event?.payload;
        if (!payload || typeof payload !== "object") continue;
        // A diff, if one comes anyway, is merged into what was known.
        state = event.diff ? { ...state, ...payload } : payload;
        handle(state);
      }
    });
    child.on("error", (error) => log(`Now Playing: ${error.message}`));
    child.on("exit", () => {
      if (stopped) return;
      log(`Now Playing stream stopped; starting it again in ${RESTART_MS / 1000}s`);
      setTimeout(() => {
        if (!stopped) start();
      }, RESTART_MS);
    });
  }

  start();
  handle(first);
  return {
    /**
     * Press next-track for djay. False when djay does not hold Now Playing
     * or the press failed, so the caller can skip some other way; true
     * says only that it was sent - what comes on air says whether it worked.
     */
    async next() {
      if (!isDjay(state)) {
        log(`next-track not sent: Now Playing is ${state.bundleIdentifier ?? "nobody"}, not djay`);
        return false;
      }
      try {
        await run("next-track");
        return true;
      } catch (error) {
        log(`next-track failed: ${error.message}`);
        return false;
      }
    },
    stop() {
      stopped = true;
      child?.kill();
    },
  };
}
