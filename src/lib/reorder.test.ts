import { describe, expect, it } from "vitest";
import { moveOne } from "./reorder";

const list = [{ id: 10 }, { id: 20 }, { id: 30 }];
const ids = (items: { id: number }[]) => items.map((item) => item.id);

describe("moveOne", () => {
  it("moves an entry up one place", () => {
    expect(ids(moveOne(list, 30, "up"))).toEqual([10, 30, 20]);
  });

  it("moves an entry down one place", () => {
    expect(ids(moveOne(list, 10, "down"))).toEqual([20, 10, 30]);
  });

  it("leaves the list alone at either end", () => {
    expect(ids(moveOne(list, 10, "up"))).toEqual([10, 20, 30]);
    expect(ids(moveOne(list, 30, "down"))).toEqual([10, 20, 30]);
  });

  it("leaves the list alone for an id it does not hold", () => {
    expect(ids(moveOne(list, 99, "up"))).toEqual([10, 20, 30]);
  });

  it("never mutates what it was given", () => {
    moveOne(list, 20, "up");
    expect(ids(list)).toEqual([10, 20, 30]);
  });
});
