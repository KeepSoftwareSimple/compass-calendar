import { CalendarIdSchema } from "@core/types/domain-primitives";
import { createMockCalendar as calendar } from "@web/__tests__/utils/factories/calendar.factory";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import {
  buildCalendarLookup,
  resolveCalendarCardIdentity,
} from "./useCalendarLookup";
import { describe, expect, it } from "bun:test";

describe("resolveCalendarCardIdentity", () => {
  it("returns null with only one calendar (nothing to distinguish)", () => {
    const solo = calendar();
    const lookup = buildCalendarLookup([solo]);

    expect(
      resolveCalendarCardIdentity(lookup, { calendarId: solo.id }),
    ).toBeNull();
  });

  it("returns the calendar's name and color with two or more calendars", () => {
    const work = calendar({ name: "Work", backgroundColor: "#3b82f6" });
    const personal = calendar({ name: "Personal" });
    const lookup = buildCalendarLookup([work, personal]);

    expect(
      resolveCalendarCardIdentity(lookup, { calendarId: work.id }),
    ).toEqual({
      name: "Work",
      backgroundColor: "#3b82f6",
    });
  });

  it("carries the cross-account duplicate through when given one", () => {
    const work = calendar({ name: "Work" });
    const personal = calendar({ name: "Personal" });
    const lookup = buildCalendarLookup([work, personal]);
    const duplicate = [{ label: "ahab@gmail.com", backgroundColor: "#ef4444" }];

    expect(
      resolveCalendarCardIdentity(lookup, {
        calendarId: work.id,
        otherCopies: duplicate,
      }),
    ).toEqual({
      name: "Work",
      backgroundColor: work.backgroundColor,
      otherCopies: duplicate,
    });
  });

  it("returns null for a calendarId not in the lookup", () => {
    const work = calendar();
    const personal = calendar();
    const lookup = buildCalendarLookup([work, personal]);
    const missing = CalendarIdSchema.parse(createObjectIdString());

    expect(
      resolveCalendarCardIdentity(lookup, { calendarId: missing }),
    ).toBeNull();
  });
});
