import {
  reactDatepickerYearPageBounds,
  shiftYearPageBounds,
  yearRangeCaptionFromBounds,
} from "@web/components/DatePicker/caption-picker-year-page";
import { describe, expect, it } from "bun:test";

describe("caption-picker-year-page", () => {
  it("matches react-datepicker 1-based twenty-year pages", () => {
    expect(reactDatepickerYearPageBounds(1993)).toEqual({
      start: 1981,
      end: 2000,
    });
    expect(reactDatepickerYearPageBounds(2000)).toEqual({
      start: 1981,
      end: 2000,
    });
    expect(reactDatepickerYearPageBounds(2026)).toEqual({
      start: 2021,
      end: 2040,
    });
  });

  it("labels the visible page bounds", () => {
    expect(
      yearRangeCaptionFromBounds(reactDatepickerYearPageBounds(1993)),
    ).toBe("Years 1981 to 2000");
  });

  it("steps pages by one twenty-year block", () => {
    const page = reactDatepickerYearPageBounds(1993);
    expect(shiftYearPageBounds(page, -1)).toEqual({ start: 1961, end: 1980 });
    expect(shiftYearPageBounds(page, 1)).toEqual({ start: 2001, end: 2020 });
  });
});
