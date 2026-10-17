import { describe, expect, it } from "vitest";
import {
  MAX_TILE_RATIO,
  MAX_ZOOM,
  MIN_TILE_RATIO,
  REST,
  TAP_ZOOM,
  clampView,
  groupByDay,
  tileRatio,
  toGalleryItem,
  trueRatio,
  wrapIndex,
  zoomAbout,
} from "./gallery";

const row = {
  id: 1,
  caption: null,
  uploaderName: null,
  width: 1200,
  height: 1600,
  fromBooth: false,
};

describe("toGalleryItem", () => {
  it("files a photograph under the Auckland day, not the UTC one", () => {
    // 11:30 UTC on the 20th is half past midnight on the 21st in a NZDT March.
    const item = toGalleryItem({ ...row, createdAt: new Date("2027-03-20T11:30:00Z") });
    expect(item.day).toBe("2027-03-21");
    expect(item.time).toBe("12:30 am");
  });

  it("drops the Date, so the result can cross to the client", () => {
    const item = toGalleryItem({ ...row, createdAt: new Date("2027-03-20T07:42:00Z") });
    expect(item).not.toHaveProperty("createdAt");
    expect(item.time).toBe("8:42 pm");
  });
});

describe("tileRatio and trueRatio", () => {
  it("is width over height", () => {
    expect(tileRatio({ width: 1600, height: 1200 })).toBeCloseTo(4 / 3);
    expect(trueRatio({ width: 1200, height: 1600 })).toBeCloseTo(3 / 4);
  });

  it("treats an unknown shape as square", () => {
    expect(tileRatio({ width: null, height: 900 })).toBe(1);
    expect(trueRatio({ width: 900, height: 0 })).toBe(1);
  });

  it("crops tiles at the extremes but never the lightbox", () => {
    expect(tileRatio({ width: 6000, height: 1000 })).toBe(MAX_TILE_RATIO);
    expect(tileRatio({ width: 500, height: 3000 })).toBe(MIN_TILE_RATIO);
    expect(trueRatio({ width: 6000, height: 1000 })).toBe(6);
  });
});

describe("groupByDay", () => {
  const at = (id: number, day: string) => ({ id, day });

  it("labels each day in full", () => {
    const [group] = groupByDay([at(1, "2027-03-20")]);
    // Whether ICU puts a comma after the weekday varies by Node build.
    expect(group.label).toMatch(/^Saturday,? 20 March 2027$/);
    expect(group.items).toEqual([at(1, "2027-03-20")]);
  });

  it("draws lines through the given order rather than re-sorting it", () => {
    const groups = groupByDay([
      at(4, "2027-03-21"),
      at(3, "2027-03-20"),
      at(2, "2027-03-20"),
      at(1, "2027-03-19"),
    ]);
    expect(groups.map((g) => [g.day, g.items.map((i) => i.id)])).toEqual([
      ["2027-03-21", [4]],
      ["2027-03-20", [3, 2]],
      ["2027-03-19", [1]],
    ]);
  });

  it("is empty for nothing", () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe("wrapIndex", () => {
  it("goes round in both directions", () => {
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(7, 3)).toBe(1);
  });

  it("does not divide by zero on an empty album", () => {
    expect(wrapIndex(-1, 0)).toBe(0);
  });
});

describe("clampView", () => {
  const photo = { width: 400, height: 300 };
  const stage = { width: 800, height: 600 };

  it("holds a photograph at rest in the middle", () => {
    expect(clampView({ scale: 1, x: 120, y: -80 }, photo, stage)).toEqual(REST);
  });

  it("lets a zoomed photograph travel until its edge meets the stage's", () => {
    // At 4x the photograph is 1600 x 1200: 400 of slack each side across, 300 down.
    expect(clampView({ scale: 4, x: 1000, y: -1000 }, photo, stage)).toEqual({
      scale: 4,
      x: 400,
      y: -300,
    });
    expect(clampView({ scale: 4, x: -150, y: 20 }, photo, stage)).toEqual({
      scale: 4,
      x: -150,
      y: 20,
    });
  });

  it("keeps a short axis centred while the long one pans", () => {
    // At 2x a 4:3 photograph exactly fills a 4:3 stage, so neither axis may move.
    expect(clampView({ scale: 2, x: 50, y: 50 }, photo, stage)).toEqual({
      scale: 2,
      x: 0,
      y: 0,
    });
    // A panorama at 2x is 1600 x 400: it pans across and stays centred down.
    const wide = { width: 800, height: 200 };
    expect(clampView({ scale: 2, x: 500, y: 90 }, wide, stage)).toEqual({
      scale: 2,
      x: 400,
      y: 0,
    });
  });

  it("keeps the scale between rest and the maximum", () => {
    expect(clampView({ scale: 0.4, x: 0, y: 0 }, photo, stage).scale).toBe(1);
    expect(clampView({ scale: 9, x: 0, y: 0 }, photo, stage).scale).toBe(MAX_ZOOM);
  });
});

describe("zoomAbout", () => {
  it("zooms about the centre without moving", () => {
    expect(zoomAbout(REST, 2, { x: 0, y: 0 })).toEqual({ scale: 2, x: 0, y: 0 });
  });

  it("keeps the point under the fingers where it was", () => {
    const point = { x: 100, y: -40 };
    const before = { scale: 1.5, x: 20, y: 10 };
    const after = zoomAbout(before, 3, point);
    // The photograph-space coordinate under the point is unchanged.
    const under = (v: typeof before) => ({
      x: (point.x - v.x) / v.scale,
      y: (point.y - v.y) / v.scale,
    });
    expect(under(after).x).toBeCloseTo(under(before).x);
    expect(under(after).y).toBeCloseTo(under(before).y);
  });

  it("returns to where it started when zoomed back out about the same point", () => {
    const point = { x: -60, y: 75 };
    const there = zoomAbout(REST, TAP_ZOOM, point);
    const back = zoomAbout(there, 1, point);
    expect(back.x).toBeCloseTo(0);
    expect(back.y).toBeCloseTo(0);
  });
});
