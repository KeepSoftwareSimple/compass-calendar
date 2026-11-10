import dayjs from "@core/util/date/dayjs";
import {
  calendarAction,
  datePickerPageStep,
  isDatePickerCalendarKey,
  isDatePickerClosedFieldKey,
  movePickerCursor,
} from "@web/components/DatePicker/date-picker-keys.util";
import { describe, expect, it } from "bun:test";

const committed = new Date("2026-10-17T12:00:00.000Z");

describe("date field key guards", () => {
  it("classifies closed-field and open-calendar keys", () => {
    expect(isDatePickerClosedFieldKey("Enter")).toBe(true);
    expect(isDatePickerClosedFieldKey("Escape")).toBe(false);
    expect(isDatePickerCalendarKey("Escape")).toBe(true);
    expect(isDatePickerCalendarKey("Tab")).toBe(false);
  });
});

describe("calendarAction", () => {
  it("moves the cursor by day and week", () => {
    expect(calendarAction("ArrowLeft")).toEqual({
      kind: "moveCursor",
      days: -1,
    });
    expect(calendarAction("ArrowDown")).toEqual({
      kind: "moveCursor",
      days: 7,
    });
    expect(calendarAction("Enter")).toEqual({ kind: "pickCursor" });
    expect(calendarAction("Escape")).toEqual({ kind: "close" });
  });
});

describe("datePickerPageStep", () => {
  it("pages by month, and by year with Shift", () => {
    expect(datePickerPageStep("PageDown", false)).toEqual({
      unit: "month",
      delta: 1,
    });
    expect(datePickerPageStep("PageUp", false)).toEqual({
      unit: "month",
      delta: -1,
    });
    expect(datePickerPageStep("PageDown", true)).toEqual({
      unit: "year",
      delta: 1,
    });
    expect(datePickerPageStep("PageUp", true)).toEqual({
      unit: "year",
      delta: -1,
    });
  });

  it("ignores every other key so callers fall through", () => {
    expect(datePickerPageStep("ArrowDown", false)).toBeNull();
    expect(datePickerPageStep("Enter", true)).toBeNull();
  });
});

describe("movePickerCursor", () => {
  it("anchors on the committed date until the cursor moves", () => {
    const moved = movePickerCursor(null, committed, 7);
    expect(moved.format("YYYY-MM-DD")).toBe("2026-10-24");
    expect(
      movePickerCursor(dayjs("2026-10-24"), committed, -7).format("YYYY-MM-DD"),
    ).toBe("2026-10-17");
  });
});
