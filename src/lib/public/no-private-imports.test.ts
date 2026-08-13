import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The public invitation tree is served with no basicauth in front of it.
 * Everything it can read has to come through `@/lib/public`, where the
 * column lists are written down and reviewable - not from `@/db` or the
 * planner's own query layer, where a stray `select()` would hand a guest
 * the budget.
 *
 * This is the test that makes that a rule rather than an intention. It
 * fails the moment someone reaches for the database directly from a page
 * a stranger can load.
 */

/**
 * The whole public surface is one folder, which is what lets this check
 * be exhaustive rather than a list someone has to remember to extend.
 * A public page added anywhere else would not be served without also
 * being added to the proxy allowlist - and `proxy.test.ts` guards that.
 */
const PUBLIC_TREE = join(process.cwd(), "src/app/(public)");

/** Imports that would put unreviewed data within reach of a public page. */
const FORBIDDEN = [
  { specifier: "@/db", why: "goes through @/lib/public instead" },
  { specifier: "@/db/schema", why: "goes through @/lib/public instead" },
  { specifier: "@/lib/queries", why: "that layer is for the planner" },
  { specifier: "drizzle-orm", why: "the public tree does not build queries" },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("the public invitation tree", () => {
  const files = sourceFiles(PUBLIC_TREE);

  it("has files to check at all", () => {
    // Guards against the suite passing because the tree moved and this
    // test quietly started looking at nothing.
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(FORBIDDEN)(
    "never imports $specifier ($why)",
    ({ specifier }) => {
      const pattern = new RegExp(
        `from\\s+["']${specifier.replace(/[/\\]/g, "\\$&")}["']`,
      );
      const offenders = files.filter((file) =>
        pattern.test(readFileSync(file, "utf8")),
      );
      expect(offenders).toEqual([]);
    },
  );
});
