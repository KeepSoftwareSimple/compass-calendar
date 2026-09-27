import { type AdminPutBookingPageInput } from "@core/types/booking.contracts";
import {
  CalendarIdSchema,
  TimeZoneSchema,
} from "@core/types/domain-primitives";
import { createMockCalendar } from "@web/__tests__/utils/factories/calendar.factory";
import {
  defaultBlockingCalendarIdsForDestination,
  isBookingSettingsFormDirty,
} from "@web/booking/booking.util";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { describe, expect, it } from "bun:test";

const calendarId = () => CalendarIdSchema.parse(createObjectIdString());

describe("defaultBlockingCalendarIdsForDestination", () => {
  it("includes Compass alongside the destination account's calendars", () => {
    const workId = calendarId();
    const personalId = calendarId();
    const compassId = calendarId();
    const work = createMockCalendar({
      id: workId,
      name: "Work",
      accountEmail: "host@example.com",
    });
    const personal = createMockCalendar({
      id: personalId,
      name: "Personal",
      accountEmail: "other@example.com",
    });
    const compass = createMockCalendar({
      id: compassId,
      name: "Compass",
      provider: "local",
    });

    expect(
      defaultBlockingCalendarIdsForDestination(workId, [
        work,
        personal,
        compass,
      ]),
    ).toEqual([workId, compassId]);
  });

  it("still includes Compass when the destination has no account email", () => {
    const destinationId = calendarId();
    const compassId = calendarId();
    const destination = createMockCalendar({
      id: destinationId,
      name: "Work",
    });
    const compass = createMockCalendar({
      id: compassId,
      name: "Compass",
      provider: "local",
    });

    expect(
      defaultBlockingCalendarIdsForDestination(destinationId, [
        destination,
        compass,
      ]),
    ).toEqual([destinationId, compassId]);
  });

  it("does not duplicate Compass when it is already in the blocking set", () => {
    const compassId = calendarId();
    const compass = createMockCalendar({
      id: compassId,
      name: "Compass",
      provider: "local",
    });

    expect(
      defaultBlockingCalendarIdsForDestination(compassId, [compass]),
    ).toEqual([compassId]);
  });
});

const bookingForm = (
  overrides: Partial<AdminPutBookingPageInput> = {},
): AdminPutBookingPageInput => {
  const destinationCalendarId = CalendarIdSchema.parse(createObjectIdString());
  return {
    enabled: false,
    durationMinutes: 30,
    destinationCalendarId,
    blockingCalendarIds: [destinationCalendarId],
    timeZone: TimeZoneSchema.parse("UTC"),
    weeklyAvailability: [],
    minNoticeHours: 4,
    maxHorizonDays: 60,
    ...overrides,
  };
};

describe("isBookingSettingsFormDirty", () => {
  it("is clean when the form matches the seeded page", () => {
    const baseline = bookingForm();
    expect(
      isBookingSettingsFormDirty({
        baseline,
        form: { ...baseline },
        horizonText: "60",
        minNoticeText: "4",
      }),
    ).toBe(false);
  });

  it("is dirty when a PUT field changes", () => {
    const baseline = bookingForm();
    expect(
      isBookingSettingsFormDirty({
        baseline,
        form: { ...baseline, durationMinutes: 45 },
        horizonText: "60",
        minNoticeText: "4",
      }),
    ).toBe(true);
  });

  it("is dirty when a number field is cleared even if the parsed value is unchanged", () => {
    const baseline = bookingForm();
    expect(
      isBookingSettingsFormDirty({
        baseline,
        form: baseline,
        horizonText: "",
        minNoticeText: "4",
      }),
    ).toBe(true);
  });
});
