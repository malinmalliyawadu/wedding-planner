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
 *   - `skip` : the song on air was voted off - press Skip
 *   - `help` : djay could not find these - run the fallback (Claude) on them
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
 *   DJ_DRIVER            djay (default) or fake
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

  const driver =
    (process.env.DJ_DRIVER ?? "djay") === "fake"
      ? fakeDriver({ songSeconds: Number(process.env.FAKE_SONG_SECONDS ?? 20), log })
      : await djayDriver(process.env.DJ_CONFIG ?? join(here, "djay.config.json"));
  const fallback = process.env.DJ_FALLBACK_COMMAND ?? "";

  keepAwake();
  log(`bridge up: driver ${driver.name}, polling every ${POLL_MS}ms`);
  if (!driver.canReadDecks) {
    log("this driver cannot read djay's decks: mark songs on air from the planner, or calibrate nowPlaying");
  }
  if (!fallback) log("no DJ_FALLBACK_COMMAND: songs djay cannot find will wait in the planner");

  /** What we last told the app was on air (undefined: never said). */
  let reported;
  /** Skip presses per item: { at, count }. */
  const skips = new Map();
  /** Songs already handed to the fallback this run. */
  const helped = new Set();
  /** While the fallback has the screen, the bridge keeps its hands off. */
  let fallbackBusy = false;
  let wasDown = false;

  for (;;) {
    try {
      let ins = await api("GET");
      if (wasDown) log("app reachable again");
      wasDown = false;

      if (!fallbackBusy && ins.skip) {
        const tried = skips.get(ins.skip.id);
        if (!tried || (tried.count < SKIP_ATTEMPTS && Date.now() - tried.at > SKIP_RETRY_MS)) {
          log(`skip: ${describe(ins.skip)}`);
          skips.set(ins.skip.id, { at: Date.now(), count: (tried?.count ?? 0) + 1 });
          await driver.skip().catch((error) => log(`skip failed: ${error.message}`));
        }
      }

      if (!fallbackBusy && ins.cue) {
        log(`cue: ${describe(ins.cue)}`);
        const result = await driver.cue(ins.cue);
        ins = result.ok
          ? await api("POST", { type: "cued", itemId: ins.cue.id })
          : await api("POST", { type: "cue_failed", itemId: ins.cue.id, note: result.note });
        if (!result.ok) log(`  not found: ${result.note}`);
      }

      if (!fallbackBusy && fallback) {
        const song = ins.help.find((item) => !helped.has(item.id));
        if (song) {
          helped.add(song.id);
          fallbackBusy = true;
          log(`fallback: looking for ${describe(song)}`);
          // Not awaited: the bridge keeps polling and reporting while the
          // fallback works, but presses nothing until it is done.
          fallbackPrompt(song)
            .then((prompt) => runFallback(fallback, prompt, song))
            .then(async (verdict) => {
              log(`fallback: ${describe(song)} -> ${verdict}`);
              if (verdict === "cued") await api("POST", { type: "cued", itemId: song.id });
              if (verdict === "not_found") {
                await api("POST", { type: "cue_failed", itemId: song.id, note: "Claude could not find it either" });
              }
            })
            .catch((error) => log(`fallback failed: ${error.message}`))
            .finally(() => {
              fallbackBusy = false;
            });
        }
      }

      const onAir = await driver.nowPlaying();
      if (onAir !== undefined && (reported === undefined || !sameAir(onAir, reported))) {
        log(`on air: ${onAir ? describe(onAir) : "(nothing)"}`);
        await api("POST", { type: "on_air", song: onAir });
        reported = onAir;
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
