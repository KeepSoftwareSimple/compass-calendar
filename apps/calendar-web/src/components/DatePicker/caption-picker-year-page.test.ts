import {
  reactDatepickerYearRangeCaption,
  yearPageContaining,
  yearRangeCaption,
} from "@web/components/DatePicker/caption-picker-year-page";
import { describe, expect, it } from "bun:test";

describe("caption-picker-year-page", () => {
  it("pages years in blocks of twenty aligned with macOS", () => {
    expect(yearPageContaining(2026)).toEqual([
      ...Array.from({ length: 20 }, (_, i) => 2020 + i),
    ]);
    expect(yearPageContaining(1993)[0]).toBe(1980);
    expect(yearPageContaining(1993).at(-1)).toBe(1999);
  });

  it("labels the visible year range in the header", () => {
    expect(yearRangeCaption(1993)).toBe("Years 1980 to 1999");
    expect(yearRangeCaption(2026)).toBe("Years 2020 to 2039");
  });

  it("labels react-datepicker year pages ending on the anchor year", () => {
    expect(reactDatepickerYearRangeCaption(2000)).toBe("Years 1981 to 2000");
  });
});
