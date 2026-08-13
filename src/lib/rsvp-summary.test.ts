import { describe, expect, it } from "vitest";
import {
  buildChaseList,
  countAttending,
  repliedHouseholds,
  type RsvpGuest,
  type RsvpHousehold,
} from "./rsvp-summary";

const guest = (
  ageBracket: RsvpGuest["ageBracket"],
  rsvpStatus: RsvpGuest["rsvpStatus"],
): RsvpGuest => ({ ageBracket, rsvpStatus });

const household = (
  id: number,
  name: string,
  guests: RsvpGuest[],
  extra: Partial<RsvpHousehold> = {},
): RsvpHousehold => ({
  id,
  name,
  inviteToken: "abcdefghjkmnpqrstuvw",
  respondedAt: null,
  guests,
  ...extra,
});

describe("countAttending", () => {
  it("counts only those who said yes", () => {
    const count = countAttending([
      guest("adult", "attending"),
      guest("adult", "declined"),
      guest("adult", "pending"),
    ]);
    expect(count.adults).toBe(1);
    expect(count.catered).toBe(1);
  });

  it("keeps infants out of the catered count but in the room", () => {
    // The budget charges per adult and per child; infants are free and
    // sit on a lap. Both numbers are real and they are not the same.
    const count = countAttending([
      guest("adult", "attending"),
      guest("child", "attending"),
      guest("infant", "attending"),
    ]);
    expect(count.catered).toBe(2);
    expect(count.bodies).toBe(3);
    expect(count.infants).toBe(1);
  });

  it("is all zeroes for nobody", () => {
    expect(countAttending([])).toEqual({
      adults: 0,
      children: 0,
      infants: 0,
      catered: 0,
      bodies: 0,
    });
  });
});

describe("buildChaseList", () => {
  it("leaves out households that have fully replied", () => {
    const list = buildChaseList([
      household(1, "Done", [guest("adult", "attending")]),
      household(2, "Declined", [guest("adult", "declined")]),
    ]);
    expect(list).toEqual([]);
  });

  it("puts a half-answered household above one that has not started", () => {
    const list = buildChaseList([
      household(1, "Silent", [guest("adult", "pending")]),
      household(2, "Half", [
        guest("adult", "attending"),
        guest("adult", "pending"),
      ]),
    ]);
    expect(list.map((entry) => entry.household.name)).toEqual([
      "Half",
      "Silent",
    ]);
    expect(list[0].reason).toBe("partial");
    expect(list[1].reason).toBe("not_replied");
  });

  it("separates 'never sent a link' from 'sent one and heard nothing'", () => {
    // Different actions: one needs a link minting, the other a nudge.
    const list = buildChaseList([
      household(1, "Linked", [guest("adult", "pending")]),
      household(2, "Unlinked", [guest("adult", "pending")], {
        inviteToken: null,
      }),
    ]);
    expect(list.map((entry) => entry.reason)).toEqual([
      "not_replied",
      "no_link",
    ]);
  });

  it("ignores households with nobody on them", () => {
    expect(buildChaseList([household(1, "Empty", [])])).toEqual([]);
  });

  it("counts how many are still outstanding", () => {
    const list = buildChaseList([
      household(1, "Big", [
        guest("adult", "attending"),
        guest("adult", "pending"),
        guest("child", "pending"),
      ]),
    ]);
    expect(list[0].outstanding).toBe(2);
  });

  it("breaks ties by name so the list does not shuffle between loads", () => {
    const list = buildChaseList([
      household(1, "Zephyr", [guest("adult", "pending")]),
      household(2, "Ahern", [guest("adult", "pending")]),
    ]);
    expect(list.map((entry) => entry.household.name)).toEqual([
      "Ahern",
      "Zephyr",
    ]);
  });
});

describe("repliedHouseholds", () => {
  it("takes only the households with no pending guest left", () => {
    const replied = repliedHouseholds([
      household(1, "All in", [guest("adult", "attending")]),
      household(2, "Half", [
        guest("adult", "attending"),
        guest("adult", "pending"),
      ]),
    ]);
    expect(replied.map((h) => h.name)).toEqual(["All in"]);
  });

  it("puts the most recent reply first", () => {
    const replied = repliedHouseholds([
      household(1, "Older", [guest("adult", "attending")], {
        respondedAt: new Date("2027-01-02T00:00:00Z"),
      }),
      household(2, "Newer", [guest("adult", "declined")], {
        respondedAt: new Date("2027-01-09T00:00:00Z"),
      }),
    ]);
    expect(replied.map((h) => h.name)).toEqual(["Newer", "Older"]);
  });
});
