#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { djayDriver, probe } from "./djay.mjs";
import { fakeDriver } from "./fake.mjs";

/**
 * The DJ bridge: the wedding app's dance floor, played through djay Pro.
 *
 * Runs on the Mac running djay. Every few seconds it asks the app what to
 * do (`GET /api/dj/bridge`) and does it:
 *
 *   - `cue`  : hand this request to djay's Automix queue, report how it went
 *   - `skip` : the song on air was voted off - move on to the next track
 *   - `help` : djay could not find these - run DJ_FALLBACK_COMMAND, if set
 *
 * and tells the app what is on air whenever that changes. It reports what
 * it sees rather than what it did, so the DJ can take over at any moment
 * and the queue follows.
 *
 * Usage:
 *   node bridge.mjs            run the bridge
 *   node bridge.mjs probe      print what accessibility can see in djay
 *
 * Settings come from the environment, or from a `.env` file beside this
 * script (copy `.env.example`), so the night's command is just the first
 * line above. A variable already set in the shell wins over the file.
 *
 * While it runs on a Mac, the bridge keeps the machine awake itself
 * (`caffeinate`, released when the bridge exits): a laptop that sleeps
 * through the first dance takes the queue with it. DJ_KEEP_AWAKE=0 to
 * turn that off.
 *
 * Settings:
 *   WEDDING_URL          the app, e.g. https://wedding.example.com
 *   DJ_BRIDGE_TOKEN      the same value as on the server
 *   DJ_DRIVER            claude (default): Claude operates djay by computer
 *                        use (claude.mjs; needs `npm install` here once);
 *                        keys: fixed keyboard shortcuts (djay.mjs);
 *                        fake: a pretend djay, for rehearsing
 *   ANTHROPIC_API_KEY    for the claude driver
 *   DJ_WATCH_SECONDS     claude driver: how often it reads the decks (default 30)
 *   DJ_CONFIG            path to the djay config (default ./djay.config.json)
 *   DJ_POLL_MS           how often to ask (default 3000)
 *   DJ_FALLBACK_COMMAND  optional; run for each song djay could not find,
 *                        with the prompt on stdin. See README.md.
 *   FAKE_SONG_SECONDS    the fake driver's song length (default 20)
 *   DJ_KEEP_AWAKE        0 to let the Mac sleep (default: keep it awake)
 */

const here = dirname(fileURLToPath(import.meta.url));
loadEnvFile(join(here, ".env"));

/**
 * KEY=value lines from a `.env` file into the environment, without
 * overwriting anything already set. Blank lines and # comments are
 * skipped and one layer of matching quotes is taken off a value. Written
 * out rather than leaning on Node's own loader, which arrived late in
 * Node 20 and differs between versions.
 */
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = /^(["']).*\1$/.test(rawValue) ? rawValue.slice(1, -1) : rawValue;
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/**
 * Hold off sleep for as long as this process lives. `caffeinate -w` exits
 * by itself when the bridge does, however it ends, so nothing is left
 * holding the Mac awake afterwards.
 */
function keepAwake() {
  if (process.platform !== "darwin" || process.env.DJ_KEEP_AWAKE === "0") return;
  const child = spawn("caffeinate", ["-dis", "-w", String(process.pid)], { stdio: "ignore" });
  child.on("error", () => log("could not start caffeinate: the Mac may sleep"));
  child.unref();
  log("keeping the Mac awake while the bridge runs");
}
const POLL_MS = Number(process.env.DJ_POLL_MS ?? 3000);
const FALLBACK_TIMEOUT_MS = 5 * 60 * 1000;
/** Press Skip again if the song is still on this long after. */
const SKIP_RETRY_MS = 20 * 1000;
const SKIP_ATTEMPTS = 3;

function log(...parts) {
  console.log(new Date().toISOString().slice(11, 19), ...parts);
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set. Put it in bridge/dj/.env (see .env.example).`);
    process.exit(1);
  }
  return value;
}

async function api(method, body) {
  const base = required("WEDDING_URL").replace(/\/$/, "");
  const response = await fetch(`${base}/api/dj/bridge`, {
    method,
    headers: {
      Authorization: `Bearer ${required("DJ_BRIDGE_TOKEN")}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status}: ${payload.error ?? "no reason given"}`);
  return payload;
}

const describe = (song) => (song.artist ? `${song.title} - ${song.artist}` : song.title);
const sameAir = (a, b) =>
  (a === null && b === null) ||
  (a !== null && b !== null && a.title === b.title && (a.artist ?? null) === (b.artist ?? null));

/**
 * The prompt for the fallback. Written for Claude with computer use on
 * this Mac, but it is only text on stdin: any command that reads it and
 * ends its output with CUED or NOT_FOUND will do.
 */
async function fallbackPrompt(song) {
  const template = await readFile(join(here, "fallback-prompt.md"), "utf8");
  return template
    .replaceAll("{title}", song.title)
    .replaceAll("{artist}", song.artist ?? "(artist unknown)")
    .replaceAll("{note}", song.note ?? "none");
}

function runFallback(command, prompt, song) {
  return new Promise((resolve) => {
    const child = spawn("/bin/sh", ["-c", command], {
      env: { ...process.env, SONG_TITLE: song.title, SONG_ARTIST: song.artist ?? "" },
      stdio: ["pipe", "pipe", "inherit"],
    });
    let out = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), FALLBACK_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      out += chunk;
      process.stdout.write(chunk);
    });
    child.on("close", () => {
      clearTimeout(timer);
      const last = out.trim().split(/\r?\n/).pop()?.trim().toUpperCase() ?? "";
      resolve(last.includes("NOT_FOUND") ? "not_found" : last.includes("CUED") ? "cued" : "unsure");
    });
    child.stdin.end(prompt);
  });
}

async function main() {
  if (process.argv[2] === "probe") {
    const config = JSON.parse(await readFile(process.env.DJ_CONFIG ?? join(here, "djay.config.json"), "utf8"));
    try {
      console.log(await probe(config.app ?? "djay Pro"));
    } catch (error) {
      // To the screen, not into the file the output is usually redirected to.
      console.error(error.message.replace(/^.*(execution error|Error): /, "").replace(/ \(-\d+\)$/, ""));
      process.exit(1);
    }
    return;
  }

  // Say what is missing now, not on the first poll three seconds in.
  required("WEDDING_URL");
  required("DJ_BRIDGE_TOKEN");

  const driverName = process.env.DJ_DRIVER ?? "claude";
  let driver;
  if (driverName === "fake") {
    driver = fakeDriver({ songSeconds: Number(process.env.FAKE_SONG_SECONDS ?? 20), log });
  } else if (driverName === "keys" || driverName === "djay") {
    driver = await djayDriver(process.env.DJ_CONFIG ?? join(here, "djay.config.json"));
  } else if (driverName === "claude") {
    // Loaded only here, so the other drivers need nothing installed.
    const { claudeDriver } = await import("./claude.mjs").catch((error) => {
      if (error.code === "ERR_MODULE_NOT_FOUND") {
        console.error("The Claude driver needs its package: run `npm install` in bridge/dj.");
        process.exit(1);
      }
      throw error;
    });
    driver = await claudeDriver({ log, watchSeconds: Number(process.env.DJ_WATCH_SECONDS ?? 30) }).catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
  } else {
    console.error(`DJ_DRIVER must be claude, keys or fake, not "${driverName}".`);
    process.exit(1);
  }
  const fallback = process.env.DJ_FALLBACK_COMMAND ?? "";

  keepAwake();
  log(`bridge up: driver ${driver.name}, polling every ${POLL_MS}ms`);
  if (!driver.canReadDecks) {
    log("this driver cannot read djay's decks: mark songs on air from the planner, or calibrate nowPlaying");
  }

  /** What we last told the app was on air (undefined: never said). */
  let reported;
  /** Skip attempts per item: { at, count }. */
  const skips = new Map();
  /** Songs already handed to the fallback this run. */
  const helped = new Set();
  /** When the decks were last read, for drivers that read them on a timer. */
  let lastWatch = 0;
  let wasDown = false;

  /**
   * One thing at a time touches djay - a skip, a cue, the fallback, a look
   * at the decks - in that order of urgency. With the Claude driver one of
   * these takes tens of seconds, so it runs alongside the poll rather
   * than inside it: the bridge keeps checking in, the planner keeps
   * showing it as connected, and the next instructions are waiting when
   * the job is done.
   */
  let busy = false;

  async function reportOnAir(onAir) {
    if (onAir === undefined) return;
    if (reported !== undefined && sameAir(onAir, reported)) return;
    log(`on air: ${onAir ? describe(onAir) : "(nothing)"}`);
    await api("POST", { type: "on_air", song: onAir });
    reported = onAir;
  }

  function nextJob(ins) {
    if (ins.skip) {
      const tried = skips.get(ins.skip.id);
      if (!tried || (tried.count < SKIP_ATTEMPTS && Date.now() - tried.at > SKIP_RETRY_MS)) {
        const song = ins.skip;
        return async () => {
          log(`skip: ${describe(song)}`);
          skips.set(song.id, { at: Date.now(), count: (tried?.count ?? 0) + 1 });
          try {
            const outcome = await driver.skip(song);
            await reportOnAir(outcome?.onAir);
          } catch (error) {
            log(`  skip failed: ${error.message}`);
          }
        };
      }
    }
    if (ins.cue) {
      const song = ins.cue;
      return async () => {
        log(`cue: ${describe(song)}`);
        const result = await driver.cue(song);
        if (result.ok) log("  in the queue");
        else log(`  not added: ${result.note}`);
        await api(
          "POST",
          result.ok
            ? { type: "cued", itemId: song.id }
            : { type: "cue_failed", itemId: song.id, note: result.note },
        );
        await reportOnAir(result.onAir);
      };
    }
    const song = fallback ? ins.help.find((item) => !helped.has(item.id)) : undefined;
    if (song) {
      return async () => {
        helped.add(song.id);
        log(`fallback: looking for ${describe(song)}`);
        const verdict = await runFallback(fallback, await fallbackPrompt(song), song);
        log(`fallback: ${describe(song)} -> ${verdict}`);
        if (verdict === "cued") await api("POST", { type: "cued", itemId: song.id });
        if (verdict === "not_found") {
          await api("POST", { type: "cue_failed", itemId: song.id, note: "The fallback could not find it either" });
        }
      };
    }
    if (driver.canReadDecks && Date.now() - lastWatch >= (driver.nowPlayingEveryMs ?? 0)) {
      return async () => {
        lastWatch = Date.now();
        await reportOnAir(await driver.nowPlaying());
      };
    }
    return null;
  }

  for (;;) {
    try {
      const ins = await api("GET");
      if (wasDown) log("app reachable again");
      wasDown = false;

      const job = busy ? null : nextJob(ins);
      if (job) {
        busy = true;
        job()
          .catch((error) => log(`error: ${error.message}`))
          .finally(() => {
            busy = false;
          });
      }
    } catch (error) {
      if (!wasDown) log(`app unreachable: ${error.message}`);
      wasDown = true;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
