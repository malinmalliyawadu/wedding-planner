import { execFile, spawn } from "node:child_process";
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
 * What accessibility can see in djay's windows, as an indented tree: one
 * element a line with its role, name, description and value, and its
 * position (`[3.1.2]` is UI element 2 of UI element 1 of UI element 3 of
 * the window) - which is how a calibrated step points at it. This is
 * what calibration reads: which button is Skip, which field is the
 * search, which text holds the deck titles.
 *
 * It does not ask for `entire contents`. djay's library is a list of
 * thousands of tracks, and that is tens of thousands of elements fetched
 * one Apple Event at a time - the first version of this sat there for
 * minutes and looked hung. Instead it walks the tree itself (JavaScript
 * for Automation, for the recursion), shows only the first few rows of
 * any list or table, stops at a depth and a total, and reports progress
 * on stderr so it is visible while the tree goes to a file.
 *
 * djay is brought to the front first: a minimised app has no windows as
 * far as accessibility is concerned. When there are still none it says
 * why in words rather than as AppleScript's "Invalid index".
 */
export function probe(app = "djay Pro", { maxDepth = 14, maxNodes = 4000, rowsPerList = 3 } = {}) {
  const script = `
    function run(argv) {
      const app = argv[0];
      const maxDepth = Number(argv[1]), maxNodes = Number(argv[2]), rowsPerList = Number(argv[3]);
      Application(app).activate();
      delay(1);
      const proc = Application("System Events").processes.byName(app);
      const windows = proc.windows();
      if (windows.length === 0) throw new Error(${JSON.stringify(NO_WINDOWS)});

      const LISTS = ["AXTable", "AXOutline", "AXList", "AXBrowser", "AXGrid"];
      const out = [];
      let seen = 0;
      const read = (el, name) => {
        try {
          const v = el[name]();
          return v === null || v === undefined ? "" : String(v).replace(/\\s+/g, " ").trim();
        } catch (e) {
          return "";
        }
      };

      function walk(el, depth, path) {
        if (seen >= maxNodes) return;
        seen += 1;
        if (seen % 250 === 0) console.log("probe: " + seen + " elements...");
        const role = read(el, "role");
        const parts = [role || "?"];
        const name = read(el, "name");
        const desc = read(el, "description");
        const value = read(el, "value");
        if (name) parts.push("name: " + name);
        if (desc && desc !== name) parts.push("desc: " + desc);
        if (value && value !== name) parts.push("value: " + value.slice(0, 120));
        out.push("  ".repeat(depth) + "[" + path + "] " + parts.join(" | "));
        if (depth >= maxDepth) return;
        let kids;
        try {
          kids = el.uiElements();
        } catch (e) {
          return;
        }
        const limit = LISTS.includes(role) ? Math.min(kids.length, rowsPerList) : kids.length;
        for (let i = 0; i < limit; i += 1) walk(kids[i], depth + 1, path + "." + (i + 1));
        if (limit < kids.length) {
          out.push("  ".repeat(depth + 1) + "... " + (kids.length - limit) + " more in this list, not shown");
        }
      }

      windows.forEach((w, i) => {
        out.push("=== window " + (i + 1) + ": " + read(w, "name"));
        walk(w, 0, String(i + 1));
      });
      if (seen >= maxNodes) out.push("(stopped after " + maxNodes + " elements)");
      return out.join("\\n");
    }
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(
      "osascript",
      ["-l", "JavaScript", "-", app, String(maxDepth), String(maxNodes), String(rowsPerList)],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    // Progress lines go straight to the screen; anything else is the error.
    child.stderr.on("data", (chunk) => {
      for (const line of String(chunk).split("\n")) {
        if (line.startsWith("probe: ")) process.stderr.write(line + "\n");
        else if (line.trim()) stderr += line + "\n";
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `osascript exited with ${code}`));
    });
    child.stdin.end(script);
  });
}

const NO_WINDOWS = [
  "djay is running, but macOS is not showing this script any of its windows.",
  "Almost always: the app you ran this from has no Accessibility permission.",
  "System Settings > Privacy & Security > Accessibility: turn on the terminal you are",
  "using (Terminal, iTerm, Warp, VS Code...), then quit it completely and reopen it.",
  "Otherwise: make sure djay has a window open and it is not minimised.",
].join(" ");
