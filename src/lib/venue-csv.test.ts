import { describe, expect, it } from "vitest";
import {
  importableVenueRows,
  parseCurfew,
  parseTravelMinutes,
  parseVenueCsv,
  venueNameKey,
} from "./venue-csv";

const NONE = new Set<string>();

/** The first data row, for the many cases that only need one. */
function one(csv: string, existing: ReadonlySet<string> = NONE) {
  const result = parseVenueCsv(csv, existing);
  expect(result.fileError).toBeNull();
  return result.rows[0];
}

describe("parseVenueCsv", () => {
  it("reads the canonical header", () => {
    const row = one(
      [
        "name,locality,url,seated_capacity,hire_cost,per_head_cost,minimum_spend,travel_minutes,curfew,notes",
        "Kōwhai Barn,Matakana,https://kowhai.example,120,4500,165,12000,35,23:00,Lovely light",
      ].join("\n"),
    );

    expect(row.error).toBeNull();
    expect(row.values).toMatchObject({
      name: "Kōwhai Barn",
      locality: "Matakana",
      url: "https://kowhai.example",
      seatedCapacity: 120,
      hireFixedCostCents: 450_000,
      perHeadCostCents: 16_500,
      minimumSpendCents: 1_200_000,
      travelMinutes: 35,
      notes: "Lovely light",
    });
  });

  it("reads the header a venue spreadsheet actually has", () => {
    // Nobody researching venues writes `seated_capacity`. The aliases are
    // what let a file put together for the purpose import as it stands.
    const row = one(
      [
        "Venue,Location,Max seated,Venue hire (NZD),Website",
        'The Boatshed,Wellington waterfront,200,"$3,393",https://boatshed.example',
      ].join("\n"),
    );

    expect(row.values).toMatchObject({
      name: "The Boatshed",
      locality: "Wellington waterfront",
      seatedCapacity: 200,
      hireFixedCostCents: 339_300,
      url: "https://boatshed.example",
    });
  });

  it("refuses a file with nothing it can call a venue name", () => {
    const result = parseVenueCsv("region,notes\nWairarapa,Nice", NONE);
    expect(result.fileError).toContain("No venue name column");
    expect(result.rows).toEqual([]);
  });

  it("skips a venue already on the list, so importing twice is safe", () => {
    const result = parseVenueCsv(
      ["name", "The Boatshed", "Silverstream Retreat", "the boatshed"].join(
        "\n",
      ),
      new Set([venueNameKey("Silverstream Retreat")]),
    );

    expect(result.rows.map((r) => r.duplicate)).toEqual([false, true, true]);
    expect(importableVenueRows(result).map((r) => r.values.name)).toEqual([
      "The Boatshed",
    ]);
  });

  it("stops a row whose money is not money, rather than importing a guess", () => {
    const row = one("name,hire_cost\nThe Barn,about four grand");
    expect(row.error).toContain("not a dollar amount");
  });

  it("stops a row with no name", () => {
    const row = one("name,hire_cost\n,4500");
    expect(row.error).toContain("no name");
  });
});

describe("the unasked columns", () => {
  it("reads an unquoted hire fee as unasked, never as free", () => {
    // The whole reason the column is nullable. A venue nobody has rung
    // must not arrive costing nothing and top the comparison.
    const row = one("name,Venue hire (NZD)\nTe Wharewaka,ask");

    expect(row.error).toBeNull();
    expect(row.values.hireFixedCostCents).toBeNull();
    expect(row.warnings).toContain(
      "No hire fee, so it will sit blocked until you ask for one",
    );
  });

  it("keeps a hire fee of zero, which is a real quote", () => {
    const row = one("name,Venue hire (NZD)\nSilverstream Retreat,$0");
    expect(row.values.hireFixedCostCents).toBe(0);
    expect(row.warnings).toEqual([]);
  });

  it("leaves a capacity nobody has confirmed unknown", () => {
    const row = one("name,Max seated\nPeppers Parehua,confirm");
    expect(row.values.seatedCapacity).toBeNull();
    expect(row.error).toBeNull();
  });
});

describe("catering totals", () => {
  const HEADER =
    "Venue,Catering est. (121 guests),Catering basis,Venue hire (NZD)";

  it("works a per-head rate back out of a published total", () => {
    const row = one(
      `${HEADER}\nSilverstream Retreat,"$14,278",published,$0`,
    );

    // $14,278 over 121 guests is $118 a head, which is what the venue
    // publishes - the division is arithmetic on their figure.
    expect(row.values.perHeadCostCents).toBe(11_800);
    expect(row.warnings).toContain(
      "Per-head rate worked back from Catering est. (121 guests) over 121 guests",
    );
  });

  it("will not record the file's own estimate as if the venue had quoted it", () => {
    // "your $132pp est." is the researcher guessing. The comparison has
    // its own assumed caterer rate and marks every total it touches, so
    // the honest import is a blank here.
    const row = one(
      `${HEADER}\nThe Milk Station,"$15,970",your $132pp est.,"$2,500"`,
    );

    expect(row.values.perHeadCostCents).toBeNull();
    expect(row.warnings[0]).toContain("Catering left to the assumed caterer");
  });

  it("ignores a catering total whose header does not say how many it feeds", () => {
    const row = one("Venue,Catering est.,Catering basis\nThe Barn,$14278,published");
    expect(row.values.perHeadCostCents).toBeNull();
    expect(row.warnings[0]).toContain("does not say how many guests");
  });

  it("prefers a stated per-head rate over a total to divide", () => {
    const row = one(
      "Venue,per_head_cost,Catering est. (121 guests),Catering basis\nThe Barn,150,\"$14,278\",published",
    );
    expect(row.values.perHeadCostCents).toBe(15_000);
  });

  it("reports the guest count the file was researched at", () => {
    const result = parseVenueCsv(
      `${HEADER}\nSilverstream Retreat,"$14,278",published,$0`,
      NONE,
    );
    expect(result.cateringGuestCount).toBe(121);
  });
});

describe("notes", () => {
  it("keeps every column it cannot compute with, under its own heading", () => {
    // A venue spreadsheet is mostly prose, and the prose is the part of
    // the decision no column settles. Dropping it would be the worst
    // thing this importer could do.
    const result = parseVenueCsv(
      [
        "Venue,Region,Catering policy,On-site accommodation,Price confidence,Notes",
        "Cape Estate,Hawke's Bay,External / BYO caterer,Studio for the couple,published,1000 acres over Cape Kidnappers",
      ].join("\n"),
      NONE,
    );

    expect(result.rows[0].values.notes).toBe(
      [
        "1000 acres over Cape Kidnappers",
        "",
        "Region: Hawke's Bay",
        "Catering policy: External / BYO caterer",
        "On-site accommodation: Studio for the couple",
        "Price confidence: published",
      ].join("\n"),
    );
    expect(result.keptInNotes).toEqual([
      "Region",
      "Catering policy",
      "On-site accommodation",
      "Price confidence",
    ]);
  });

  it("keeps the travel and curfew text as well as parsing them", () => {
    // "115 min" loses the flight, and "23:00" loses which curfew it was.
    const row = one(
      [
        "Venue,Travel from Wellington,Curfew",
        "Woodlands Estate,1h05 flight + 50 min,Package runs 10am - midnight",
      ].join("\n"),
    );

    expect(row.values.travelMinutes).toBe(115);
    expect(row.values.curfew).toBe("00:00");
    expect(row.values.notes).toBe(
      "Travel from Wellington: 1h05 flight + 50 min\nCurfew: Package runs 10am - midnight",
    );
  });

  it("drops totals it recomputes rather than leaving a stale one in the notes", () => {
    const row = one(
      [
        "Venue,Est. total,Per guest,Catering basis",
        'Sudbury,"$35,455",$293,published',
      ].join("\n"),
    );
    expect(row.values.notes).toBeNull();
  });

  it("leaves the notes null when the row had nothing to say", () => {
    expect(one("name,hire_cost\nThe Barn,4500").values.notes).toBeNull();
  });

  it("does not write a heading over a blank, but does over a `None`", () => {
    // "Curfew: Not published" on every row buries the handful that did
    // publish one. "None" is an answer, and stays.
    const row = one(
      [
        "Venue,Curfew,On-site accommodation,Region",
        "Te Wharewaka o Poneke,Not published,None,Wellington region",
      ].join("\n"),
    );

    expect(row.values.notes).toBe(
      "On-site accommodation: None\nRegion: Wellington region",
    );
  });
});

describe("parseTravelMinutes", () => {
  it("reads a plain drive", () => {
    expect(parseTravelMinutes("65 min")).toBe(65);
    expect(parseTravelMinutes("5 min")).toBe(5);
  });

  it("adds up a journey with a flight in it", () => {
    expect(parseTravelMinutes("1h05 flight + 50 min")).toBe(115);
    expect(parseTravelMinutes("1h flight + 25 min")).toBe(85);
    expect(parseTravelMinutes("40 min flight + 2h15")).toBe(175);
    expect(parseTravelMinutes("1h05 flight + ~2h")).toBe(185);
  });

  it("takes the first of two ways to get there", () => {
    expect(parseTravelMinutes("350 min / 1h flight")).toBe(350);
    expect(parseTravelMinutes("390 min / fly")).toBe(390);
  });

  it("refuses a journey with a leg of unstated length", () => {
    // A ferry crossing is not nothing, and calling "Ferry + 2h" two
    // hours would be worse than admitting the journey is not known.
    expect(parseTravelMinutes("Ferry + 2h")).toBeNull();
    expect(parseTravelMinutes("2 flights + ferry")).toBeNull();
    expect(parseTravelMinutes("Ferry + 30 min")).toBeNull();
  });

  it("does not read a count of aircraft as a count of minutes", () => {
    expect(parseTravelMinutes("2 flights + 10 min")).toBeNull();
  });

  it("has nothing to say about a blank", () => {
    expect(parseTravelMinutes("")).toBeNull();
    expect(parseTravelMinutes("ask")).toBeNull();
  });
});

describe("parseCurfew", () => {
  it("reads a single time", () => {
    expect(parseCurfew("Venue closes 1:00 am (latest found)")).toBe("01:00");
    expect(parseCurfew("1am liquor licence (published)")).toBe("01:00");
    expect(parseCurfew("11:30pm")).toBe("23:30");
  });

  it("takes the end of a range, because that is when it ends", () => {
    expect(parseCurfew("Runs 3pm - 12am")).toBe("00:00");
    expect(parseCurfew("Package runs 10am - midnight")).toBe("00:00");
  });

  it("refuses a cell holding two different rules", () => {
    // Picking either would be this module deciding which one binds. Both
    // stay whole in the notes, where a person can read them.
    expect(
      parseCurfew("Venue 10am-10pm; outdoor music must stop 9:00pm"),
    ).toBeNull();
    expect(parseCurfew("Music finishes 12am, licence to 1am")).toBeNull();
    expect(parseCurfew("Finish 11:30pm, vacated by midnight")).toBeNull();
  });

  it("has nothing to say when the venue does not", () => {
    expect(parseCurfew("Not published")).toBeNull();
    expect(parseCurfew("No set curfew (sole-use property)")).toBeNull();
    expect(parseCurfew("Explicitly NO noise curfew")).toBeNull();
    expect(parseCurfew("Packages are 7 hours ceremony-to-end-of-music")).toBeNull();
  });

  it("puts noon and midnight the right way round", () => {
    expect(parseCurfew("midnight")).toBe("00:00");
    expect(parseCurfew("12am")).toBe("00:00");
    expect(parseCurfew("12pm")).toBe("12:00");
  });
});
