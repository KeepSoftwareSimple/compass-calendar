import dayjs from "@core/util/date/dayjs";
import {
  lifeBirthDateDraftPreview,
  lifeBirthDateGridAnchor,
  parseLifeBirthDateInput,
} from "@web/views/Life/parseLifeBirthDateInput.util";
import { describe, expect, it } from "bun:test";

const today = dayjs("2026-01-01");
const minDate = new Date(1900, 0, 1);
const maxDate = new Date(2026, 0, 1);
const options = { today, minDate, maxDate };

const ymd = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

describe("parseLifeBirthDateInput", () => {
  it.each([
    ["1993-04-12", "1993-04-12"],
    ["4/12/1993", "1993-04-12"],
    ["12/4/1993", "1993-12-04"],
    ["Apr 12 1993", "1993-04-12"],
    ["12 April 1993", "1993-04-12"],
    ["April 1993", "1993-04-01"],
  ] as const)("parses %s", (input, expectedYmd) => {
    const result = parseLifeBirthDateInput(input, options);
    expect(result.kind).toBe("date");
    if (result.kind === "date") {
      expect(ymd(result.date)).toBe(expectedYmd);
    }
  });

  it("treats a four-digit value as a year jump", () => {
    const result = parseLifeBirthDateInput("1993", options);
    expect(result).toEqual({
      kind: "year",
      year: 1993,
      preview: "1993 · pick day",
    });
  });

  it("notes ambiguous U.S. month/day order", () => {
    const result = parseLifeBirthDateInput("4/12/1993", options);
    expect(result.kind).toBe("date");
    if (result.kind === "date") {
      expect(result.usesMonthDayOrder).toBe(true);
      expect(lifeBirthDateDraftPreview(result, "4/12/1993")).toBe(
        "Apr 12, 1993 · month/day",
      );
    }
  });

  it("rejects future birth dates", () => {
    const result = parseLifeBirthDateInput("2027-01-01", options);
    expect(result).toEqual({
      kind: "invalid",
      message: "Birth date cannot be in the future",
    });
  });

  it("rejects dates before 1900", () => {
    const result = parseLifeBirthDateInput("1899-12-31", options);
    expect(result).toEqual({
      kind: "invalid",
      message: "Enter a date in 1900 or later",
    });
  });

  it("rejects unparseable input", () => {
    expect(parseLifeBirthDateInput("not a date", options).kind).toBe("invalid");
  });

  it("maps parsed dates to a grid month and day cursor", () => {
    const parsed = parseLifeBirthDateInput("4/12/1993", options);
    expect(parsed.kind).toBe("date");
    if (parsed.kind !== "date") return;
    const anchor = lifeBirthDateGridAnchor(parsed);
    expect(anchor?.month.format("YYYY-MM")).toBe("1993-04");
    expect(anchor?.cursor.date()).toBe(12);
  });

  it("maps a year-only parse to January of that year", () => {
    const parsed = parseLifeBirthDateInput("1993", options);
    expect(parsed.kind).toBe("year");
    if (parsed.kind !== "year") return;
    const anchor = lifeBirthDateGridAnchor(parsed);
    expect(anchor?.month.format("YYYY-MM")).toBe("1993-01");
    expect(anchor?.cursor.date()).toBe(1);
  });
});
