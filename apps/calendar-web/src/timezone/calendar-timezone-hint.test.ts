import { TimeZoneSchema } from "@core/types/domain-primitives";
import dayjs from "@core/util/date/dayjs";
import { createMockCalendar } from "@web/__tests__/utils/factories/calendar.factory";
import {
  pickCalendarTimeZoneHint,
  syncCalendarTimeZoneHintFromCalendars,
} from "@web/timezone/calendar-timezone-hint";
import {
  getEffectiveTimeZone,
  resetEffectiveTimeZoneStoreForTests,
  setBrowserTimeZoneForTests,
} from "@web/timezone/effective-timezone.store";
import { afterEach, describe, expect, it, setSystemTime } from "bun:test";

describe("syncCalendarTimeZoneHintFromCalendars", () => {
  afterEach(() => {
    resetEffectiveTimeZoneStoreForTests();
    setSystemTime();
  });

  it("applies denver today before navigation when the browser is UTC at the merge-queue boundary", () => {
    setBrowserTimeZoneForTests("UTC");
    setSystemTime(new Date("2026-11-12T00:23:00.000Z"));
    syncCalendarTimeZoneHintFromCalendars([
      createMockCalendar({
        name: "miscellaneous",
        timeZone: TimeZoneSchema.parse("America/Denver"),
        isPrimary: true,
      }),
    ]);
    expect(getEffectiveTimeZone()).toBe("America/Denver");
    expect(dayjs().tz(getEffectiveTimeZone()).format("YYYY-MM-DD")).toBe(
      "2026-11-11",
    );
  });
});

describe("pickCalendarTimeZoneHint", () => {
  it("prefers the primary calendar zone", () => {
    const calendars = [
      createMockCalendar({
        name: "Work",
        timeZone: TimeZoneSchema.parse("America/New_York"),
        isPrimary: true,
      }),
      createMockCalendar({
        name: "Other",
        timeZone: TimeZoneSchema.parse("America/Denver"),
        isPrimary: false,
      }),
    ];
    expect(pickCalendarTimeZoneHint(calendars)).toBe("America/New_York");
  });

  it("skips UTC when another calendar has a regional zone", () => {
    const calendars = [
      createMockCalendar({
        name: "UTC cal",
        timeZone: TimeZoneSchema.parse("UTC"),
        isPrimary: false,
      }),
      createMockCalendar({
        name: "Denver",
        timeZone: TimeZoneSchema.parse("America/Denver"),
        isPrimary: false,
      }),
    ];
    expect(pickCalendarTimeZoneHint(calendars)).toBe("America/Denver");
  });
});
