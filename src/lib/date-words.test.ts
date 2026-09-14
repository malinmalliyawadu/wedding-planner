import { describe, expect, it } from "vitest";
import {
  dateInWords,
  numberInWords,
  ordinalInWords,
  timeInWords,
  yearInWords,
} from "./date-words";

describe("numberInWords", () => {
  it("handles the teens and the hyphenated compounds", () => {
    expect(numberInWords(0)).toBe("zero");
    expect(numberInWords(7)).toBe("seven");
    expect(numberInWords(13)).toBe("thirteen");
    expect(numberInWords(20)).toBe("twenty");
    expect(numberInWords(27)).toBe("twenty-seven");
    expect(numberInWords(99)).toBe("ninety-nine");
  });

  it("refuses anything outside 0-99", () => {
    expect(() => numberInWords(100)).toThrow(RangeError);
    expect(() => numberInWords(-1)).toThrow(RangeError);
    expect(() => numberInWords(1.5)).toThrow(RangeError);
  });
});

describe("ordinalInWords", () => {
  it("covers every day a month can have", () => {
    expect(ordinalInWords(1)).toBe("first");
    expect(ordinalInWords(2)).toBe("second");
    expect(ordinalInWords(3)).toBe("third");
    expect(ordinalInWords(12)).toBe("twelfth");
    expect(ordinalInWords(20)).toBe("twentieth");
    expect(ordinalInWords(21)).toBe("twenty-first");
    expect(ordinalInWords(23)).toBe("twenty-third");
    expect(ordinalInWords(30)).toBe("thirtieth");
    expect(ordinalInWords(31)).toBe("thirty-first");
  });

  it("refuses a thirty-second", () => {
    expect(() => ordinalInWords(32)).toThrow(RangeError);
    expect(() => ordinalInWords(0)).toThrow(RangeError);
  });
});

describe("yearInWords", () => {
  it("says this century's years the formal way", () => {
    expect(yearInWords(2027)).toBe("two thousand and twenty-seven");
    expect(yearInWords(2000)).toBe("two thousand");
    expect(yearInWords(2030)).toBe("two thousand and thirty");
    expect(yearInWords(2001)).toBe("two thousand and one");
  });

  it("says other centuries the spoken way", () => {
    expect(yearInWords(1999)).toBe("nineteen ninety-nine");
    expect(yearInWords(1900)).toBe("nineteen hundred");
    expect(yearInWords(2150)).toBe("twenty-one fifty");
  });
});

describe("dateInWords", () => {
  it("sets the wedding date as an engraver would", () => {
    expect(dateInWords("2027-03-20")).toEqual({
      weekday: "Saturday",
      day: "the twentieth of March",
      year: "two thousand and twenty-seven",
    });
  });

  it("does not drift a day at either end of the month", () => {
    expect(dateInWords("2027-01-01").day).toBe("the first of January");
    expect(dateInWords("2027-12-31").day).toBe("the thirty-first of December");
    expect(dateInWords("2027-12-31").weekday).toBe("Friday");
  });

  it("rejects anything that is not a plain ISO date", () => {
    expect(() => dateInWords("20/03/2027")).toThrow(RangeError);
  });
});

describe("timeInWords", () => {
  it("words the quarter hours", () => {
    expect(timeInWords("14:00")).toBe("two o'clock in the afternoon");
    expect(timeInWords("13:30")).toBe("half past one in the afternoon");
    expect(timeInWords("11:15")).toBe("a quarter past eleven in the morning");
    expect(timeInWords("17:45")).toBe("a quarter to six in the evening");
    expect(timeInWords("09:00:00")).toBe("nine o'clock in the morning");
  });

  it("knows noon and midnight by name", () => {
    expect(timeInWords("12:00")).toBe("twelve noon");
    expect(timeInWords("00:00")).toBe("midnight");
    expect(timeInWords("11:45")).toBe("a quarter to noon");
    expect(timeInWords("23:45")).toBe("a quarter to midnight");
  });

  it("moves the period with the hour it names", () => {
    // 16:45 is still the afternoon, but the hour it names is five.
    expect(timeInWords("16:45")).toBe("a quarter to five in the evening");
    expect(timeInWords("12:30")).toBe("half past twelve in the afternoon");
  });

  it("declines to invent a wording for other minutes", () => {
    expect(timeInWords("14:20")).toBeNull();
    expect(timeInWords("not a time")).toBeNull();
    expect(timeInWords("25:00")).toBeNull();
  });
});
