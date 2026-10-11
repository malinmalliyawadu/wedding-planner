import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";

/**
 * The djay Pro driver: macOS accessibility, through `osascript`.
 *
 * djay has no API and no AppleScript dictionary, so this does what a
 * person at the laptop would - focus the search, paste the song, add the
 * top result to the Automix queue, press Skip - as System Events key
 * presses and clicks. Every step comes from `djay.config.json`, because
 * the right ones depend on djay's version and on how its keyboard
 * shortcuts are set up on this Mac, and finding them is a job for the
 * laptop rather than for code (see README.md, "Calibrating").
 *
 * Text goes in through the clipboard rather than `keystroke`, which
 * cannot type a macron and would mangle "Kōwhai". Songs are passed to
 * osascript as arguments, never spliced into the script, so a title with
 * a quote in it is just a title.
 *
 * The terminal running the bridge needs Accessibility permission
 * (System Settings > Privacy & Security > Accessibility), or every step
 * fails with "not allowed assistive access".
 */

const KEY_CODES = {
  return: 36,
  tab: 48,
  space: 49,
  delete: 51,
  escape: 53,
  left: 123,
  right: 124,
  down: 125,
  up: 126,
};

const MODIFIERS = {
  command: "command down",
  shift: "shift down",
  option: "option down",
  control: "control down",
};

/** An AppleScript string literal. Only used for config, never for songs. */
function literal(text) {
  return `"${String(text).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function using(step) {
  const mods = (step.using ?? []).map((name) => {
    const mod = MODIFIERS[name];
    if (!mod) throw new Error(`Unknown modifier "${name}" in djay.config.json`);
    return mod;
  });
  return mods.length === 0 ? "" : ` using {${mods.join(", ")}}`;
}

/**
 * One config step as AppleScript, inside `tell process <app>`. `{query}`
 * in a paste step becomes argv item 1.
 */
function compileStep(step, app) {
  if (step.activate) return `tell application ${literal(app)} to activate\ndelay 0.3`;
  if (step.delay !== undefined) return `delay ${Number(step.delay)}`;
  if (step.keystroke !== undefined) return `keystroke ${literal(step.keystroke)}${using(step)}`;
  if (step.key !== undefined) {
    const code = KEY_CODES[step.key];
    if (code === undefined) throw new Error(`Unknown key "${step.key}" in djay.config.json`);
    return `key code ${code}${using(step)}`;
  }
  if (step.paste !== undefined) {
    const value = step.paste === "{query}" ? "item 1 of argv" : literal(step.paste);
    return `set the clipboard to (${value})\ndelay 0.1\nkeystroke "v" using {command down}`;
  }
  if (step.click !== undefined) {
    // Walks the window for a button whose name or description matches.
    // Slow on a big window, but a skip is once a song.
    const name = literal(step.click);
    return [
      "set clicked to false",
      "repeat with el in (entire contents of front window)",
      "  try",
      `    if (role of el is "AXButton") and ((name of el is ${name}) or (description of el is ${name})) then`,
      "      click el",
      "      set clicked to true",
      "      exit repeat",
      "    end if",
      "  end try",
      "end repeat",
      `if not clicked then error "No button called " & ${name} & " in djay's window"`,
    ].join("\n");
  }
  if (step.applescript !== undefined) return String(step.applescript);
  throw new Error(`Unrecognised step in djay.config.json: ${JSON.stringify(step)}`);
}

function compile(steps, app) {
  const body = steps
    .filter((step) => !step.activate)
    .map((step) => compileStep(step, app))
    .join("\n");
  const activate = steps.some((step) => step.activate)
    ? compileStep({ activate: true }, app)
    : "";
  return [
    "on run argv",
    activate,
    `tell application "System Events" to tell process ${literal(app)}`,
    body,
    "end tell",
    "end run",
  ].join("\n");
}

export function osascript(script, args = [], timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const child = execFile("osascript", ["-", ...args], { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) reject(new Error((stderr || error.message).trim()));
      else resolve(stdout.trim());
    });
    child.stdin.end(script);
  });
}

export async function djayDriver(configPath) {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const app = config.app ?? "djay Pro";

  return {
    name: `djay (${app})`,
    canReadDecks: Boolean(config.nowPlaying),

    async cue(song) {
      const query = [song.title, song.artist].filter(Boolean).join(" ");
      try {
        await osascript(compile(config.cue, app), [query]);
        return { ok: true };
      } catch (error) {
        return { ok: false, note: `The bridge could not add it: ${error.message}` };
      }
    },

    async skip() {
      await osascript(compile(config.skip, app));
    },

    /**
     * What is on air, `null` for nothing, or `undefined` when this driver
     * cannot tell - in which case the bridge says nothing rather than
     * guessing, and the planner marks songs on air by hand.
     *
     * The configured script returns "title" and "artist" on two lines,
     * or an empty string when nothing is playing.
     */
    async nowPlaying() {
      if (!config.nowPlaying) return undefined;
      const script = config.nowPlaying.applescript
        ? compile([{ applescript: config.nowPlaying.applescript }], app)
        : null;
      if (!script) return undefined;
      try {
        const out = await osascript(script, [], 10_000);
        if (out === "") return null;
        const [title, artist] = out.split(/\r?\n/);
        return { title: title.trim(), artist: artist?.trim() || null };
      } catch {
        return undefined;
      }
    },
  };
}

/**
 * Everything accessibility can see in djay's front window, one element a
 * line: role, name, description, value. This is what calibration reads -
 * which button is Skip, which text fields hold the deck titles.
 */
export async function probe(app = "djay Pro") {
  const script = [
    `tell application "System Events" to tell process ${literal(app)}`,
    "set out to {}",
    "repeat with el in (entire contents of front window)",
    "  set rowText to \"\"",
    "  try",
    "    set rowText to (role of el as text)",
    "  end try",
    "  try",
    "    set rowText to rowText & \" | name: \" & (name of el as text)",
    "  end try",
    "  try",
    "    set rowText to rowText & \" | desc: \" & (description of el as text)",
    "  end try",
    "  try",
    "    set rowText to rowText & \" | value: \" & (value of el as text)",
    "  end try",
    "  set end of out to rowText",
    "end repeat",
    "set AppleScript's text item delimiters to linefeed",
    "return out as text",
    "end tell",
  ].join("\n");
  return osascript(script, [], 120_000);
}
