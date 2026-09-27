import {
  CALENDAR_COLUMN_ID_ATTRIBUTE,
  getFocusedDayColumnCalendarId,
} from "./dayCalendarColumnFocus.util";
import { afterEach, describe, expect, it } from "bun:test";

describe("getFocusedDayColumnCalendarId", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns null when focus is not inside a column header", () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();

    expect(getFocusedDayColumnCalendarId()).toBeNull();
  });

  it("reads the calendar id from the focused column header", () => {
    const column = document.createElement("button");
    column.setAttribute(CALENDAR_COLUMN_ID_ATTRIBUTE, "cal-work");
    document.body.append(column);
    column.focus();

    expect(getFocusedDayColumnCalendarId()).toBe("cal-work");
  });
});
