import { TimeZoneSchema } from "@core/types/domain-primitives";
import { createMockCalendar } from "@web/__tests__/utils/factories/calendar.factory";
import { CalendarApi } from "@web/api/calendar.api";
import { calendarsQueryOptions } from "@web/calendars/calendar.query";
import * as calendarTimeZoneHint from "@web/timezone/calendar-timezone-hint";
import {
  resetEffectiveTimeZoneStoreForTests,
  setBrowserTimeZoneForTests,
} from "@web/timezone/effective-timezone.store";
import { afterEach, describe, expect, it, spyOn } from "bun:test";

describe("calendarsQueryOptions", () => {
  afterEach(() => {
    resetEffectiveTimeZoneStoreForTests();
  });

  it("syncs the calendar timezone hint when the remote list resolves", async () => {
    const calendars = [
      createMockCalendar({
        name: "Work",
        timeZone: TimeZoneSchema.parse("America/Denver"),
        isPrimary: true,
      }),
    ];
    const list = spyOn(CalendarApi, "list").mockResolvedValue(calendars);
    const sync = spyOn(
      calendarTimeZoneHint,
      "syncCalendarTimeZoneHintFromCalendars",
    );

    await calendarsQueryOptions(true).queryFn!();

    expect(list).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith(calendars);

    list.mockRestore();
    sync.mockRestore();
  });

  it("syncs the calendar timezone hint for the anonymous sentinel path", async () => {
    setBrowserTimeZoneForTests("UTC");
    const sync = spyOn(
      calendarTimeZoneHint,
      "syncCalendarTimeZoneHintFromCalendars",
    );

    await calendarsQueryOptions(false).queryFn!();

    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync.mock.calls[0]?.[0]).toHaveLength(1);
    expect(sync.mock.calls[0]?.[0][0]?.isVisible).toBe(true);

    sync.mockRestore();
  });
});
