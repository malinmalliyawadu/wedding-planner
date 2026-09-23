/**
 * Moving one entry of a hand-ordered list a step up or down.
 *
 * Pure, so the server action and the optimistic list on screen move the
 * same way. The result is the whole order, not a swap of two numbers:
 * stored sort orders drift (ties, gaps, rows added before anyone cared),
 * and renumbering 0..n-1 on every move is what stops a tie from making a
 * press of "up" do nothing.
 */

export type Direction = "up" | "down";

/**
 * `items` with the entry whose id is `id` moved one place. Returns the
 * input unchanged when it is already at that end, or is not in the list.
 */
export function moveOne<T extends { id: number }>(
  items: readonly T[],
  id: number,
  direction: Direction,
): T[] {
  const from = items.findIndex((item) => item.id === id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from === -1 || to < 0 || to >= items.length) return [...items];

  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
