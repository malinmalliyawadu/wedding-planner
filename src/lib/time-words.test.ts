import { describe, expect, it } from "vitest";
import { timeInWords } from "./time-words";

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
