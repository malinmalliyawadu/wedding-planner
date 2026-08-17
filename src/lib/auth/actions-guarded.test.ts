import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every planner action checks the session itself, and this is the test
 * that makes that a rule rather than an intention.
 *
 * It exists because a server action is not really a route, and the proxy
 * only knows about routes. An action is a POST identified by the id in its
 * `Next-Action` header; the path the POST went to is where the *response*
 * is rendered, not what decides which action runs. So "the proxy guards
 * every private path" is the wrong shape of lock for an action, and Next's
 * own guidance is the same: authorize inside the action, every time.
 *
 * That makes these one-line guards the actual boundary around every
 * mutation in the planner, not a belt-and-braces second copy of one.
 *
 * So: 50-odd actions, each one line, and a test that reads the folder
 * rather than a list somebody has to remember to extend.
 */

const APP = join(process.cwd(), "src/app");

/**
 * Public actions, which must *not* be guarded - a guest has no session and
 * an RSVP is the whole point. Each one re-resolves the household from the
 * invite token instead of trusting an id in the form; that is their
 * equivalent of this check, and `no-private-imports.test.ts` is what keeps
 * them from reaching anything else.
 */
const PUBLIC_ACTIONS = [
  "app/(public)/i/[token]/actions.ts",
  "app/(public)/i/[token]/photos/actions.ts",
];

/** Actions reachable before signing in, for obvious reasons. */
const SIGN_IN_ACTIONS = ["app/login/actions.ts"];

const GUARD = "await requireAdmin();";

describe("server actions", () => {
  const files = actionFiles(APP);

  it("all live in an actions.ts file", () => {
    // The whole check rests on this: a `"use server"` directive somewhere
    // else would be an action this test never looks at.
    const strays = sourceFiles(APP).filter(
      (file) =>
        !file.endsWith("actions.ts") &&
        /^\s*["']use server["']/m.test(readFileSync(file, "utf8")),
    );
    expect(strays.map((f) => relative(process.cwd(), f))).toEqual([]);
  });

  it("are all accounted for as planner, public or sign-in", () => {
    const planner = files.filter((f) => f.startsWith("app/admin/"));
    expect([...planner, ...PUBLIC_ACTIONS, ...SIGN_IN_ACTIONS].sort()).toEqual(
      files.sort(),
    );
  });

  it("has planner actions to check at all", () => {
    // Guards against this passing because the tree moved and it quietly
    // started looking at nothing.
    const planner = files.filter((f) => f.startsWith("app/admin/"));
    expect(planner.length).toBeGreaterThan(10);
  });

  describe.each(files.filter((f) => f.startsWith("app/admin/")))(
    "%s",
    (file) => {
      it("checks the session first in every exported action", () => {
        const unguarded = exportedActions(join(process.cwd(), "src", file))
          .filter((action) => action.firstStatement !== GUARD)
          .map((action) => `${action.name} starts with: ${action.firstStatement}`);
        expect(unguarded).toEqual([]);
      });
    },
  );

  describe.each(PUBLIC_ACTIONS)("%s", (file) => {
    it("does not require a session, because a guest has none", () => {
      const guarded = exportedActions(join(process.cwd(), "src", file))
        .filter((action) => action.firstStatement === GUARD)
        .map((action) => action.name);
      expect(guarded).toEqual([]);
    });
  });
});

/** Every `actions.ts` under src/app, relative to `src`. */
function actionFiles(dir: string): string[] {
  return sourceFiles(dir)
    .filter((file) => file.endsWith("actions.ts"))
    .map((file) => relative(join(process.cwd(), "src"), file));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/**
 * Each exported action and the first statement in its body.
 *
 * Deliberately crude - it reads text rather than a syntax tree - because
 * what it is asserting is crude: the guard is the first thing the function
 * does. A check that had to understand the code could be argued with.
 */
function exportedActions(
  file: string,
): { name: string; firstStatement: string }[] {
  const lines = readFileSync(file, "utf8").split("\n");
  const actions: { name: string; firstStatement: string }[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const declaration = /^export async function (\w+)/.exec(lines[i]);
    if (declaration === null) continue;

    // Walk to the line that opens the body, which may be several down
    // when the parameters are.
    let j = i;
    while (j < lines.length && !/\{\s*$/.test(lines[j])) j += 1;

    const firstStatement =
      lines.slice(j + 1).find((line) => line.trim() !== "")?.trim() ?? "";
    actions.push({ name: declaration[1], firstStatement });
  }

  return actions;
}
