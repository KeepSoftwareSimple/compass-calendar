import {
  type AdminGetBookingPageResult,
  BOOKING_MAX_HORIZON_DAYS,
  BOOKING_MAX_MIN_NOTICE_HOURS,
  BOOKING_PLACEHOLDER_CALENDAR_ID,
  buildDefaultAdminPutInput,
} from "@core/types/booking.contracts";
import {
  CalendarIdSchema,
  TimeZoneSchema,
} from "@core/types/domain-primitives";
import { createMockCalendar } from "@web/__tests__/utils/factories/calendar.factory";
import {
  buildInitialForm,
  HORIZON_BOUNDS,
  MIN_NOTICE_BOUNDS,
  parseBookingCount,
  savedMeetingLinkUrl,
} from "@web/booking/booking-settings-form.util";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { describe, expect, it } from "bun:test";

const calendarId = () => CalendarIdSchema.parse(createObjectIdString());

const setupPage = (
  overrides: Partial<AdminGetBookingPageResult> = {},
): AdminGetBookingPageResult =>
  ({
    ...buildDefaultAdminPutInput(TimeZoneSchema.parse("UTC")),
    isConfigured: false,
    suggestedSlug: "hostuser",
    ...overrides,
  }) as AdminGetBookingPageResult;

describe("parseBookingCount", () => {
  it("rejects a blank field so a cleared number never saves as zero", () => {
    expect(parseBookingCount("", MIN_NOTICE_BOUNDS)).toBeNull();
    expect(parseBookingCount("  ", MIN_NOTICE_BOUNDS)).toBeNull();
  });

  it("rejects fractions and values outside the contract bounds", () => {
    expect(parseBookingCount("1.5", MIN_NOTICE_BOUNDS)).toBeNull();
    expect(parseBookingCount("-1", MIN_NOTICE_BOUNDS)).toBeNull();
    expect(
      parseBookingCount(
        String(BOOKING_MAX_MIN_NOTICE_HOURS + 1),
        MIN_NOTICE_BOUNDS,
      ),
    ).toBeNull();
    expect(parseBookingCount("0", HORIZON_BOUNDS)).toBeNull();
    expect(
      parseBookingCount(String(BOOKING_MAX_HORIZON_DAYS + 1), HORIZON_BOUNDS),
    ).toBeNull();
  });

  it("accepts whole numbers at both ends of the range", () => {
    expect(parseBookingCount("0", MIN_NOTICE_BOUNDS)).toBe(0);
    expect(
      parseBookingCount(
        String(BOOKING_MAX_MIN_NOTICE_HOURS),
        MIN_NOTICE_BOUNDS,
      ),
    ).toBe(BOOKING_MAX_MIN_NOTICE_HOURS);
    expect(parseBookingCount("1", HORIZON_BOUNDS)).toBe(1);
  });
});

describe("savedMeetingLinkUrl", () => {
  it("has no link before the host has a page", () => {
    expect(savedMeetingLinkUrl(undefined)).toBeNull();
  });

  it("has no link while a saved page is live: the status header owns that copy", () => {
    const live = {
      ...buildDefaultAdminPutInput(TimeZoneSchema.parse("UTC")),
      enabled: true,
      bookingUrl: "https://compasscalendar.com/meet/hostuser",
      slug: "hostuser",
    } as AdminGetBookingPageResult;

    expect(savedMeetingLinkUrl(live)).toBeNull();
  });

  it("shows the saved link for a page that is off", () => {
    const off = {
      ...buildDefaultAdminPutInput(TimeZoneSchema.parse("UTC")),
      enabled: false,
      bookingUrl: "https://compasscalendar.com/meet/hostuser",
      slug: "hostuser",
    } as AdminGetBookingPageResult;

    expect(savedMeetingLinkUrl(off)).toBe(
      "https://compasscalendar.com/meet/hostuser",
    );
  });

  it("builds the address from the suggested slug once setup is configured", () => {
    expect(savedMeetingLinkUrl(setupPage({ isConfigured: true }))).toBe(
      `${window.location.origin}/meet/hostuser`,
    );
  });

  it("stays empty for an unconfigured page: the slug is a suggestion, not an address", () => {
    expect(savedMeetingLinkUrl(setupPage())).toBeNull();
  });
});

describe("buildInitialForm", () => {
  const zone = TimeZoneSchema.parse("America/Chicago");

  it("seeds this browser's defaults when there is no page yet", () => {
    const form = buildInitialForm(undefined, zone, [], []);

    expect(form.timeZone).toBe(zone);
    expect(form.destinationCalendarId).toBe(BOOKING_PLACEHOLDER_CALENDAR_ID);
  });

  it("replaces a placeholder destination with the first writable calendar", () => {
    const writableId = calendarId();
    const writable = createMockCalendar({ id: writableId, name: "Work" });

    const form = buildInitialForm(setupPage(), zone, [writable], [writable]);

    expect(form.destinationCalendarId).toBe(writableId);
    expect(form.blockingCalendarIds).toEqual([writableId]);
  });

  it("keeps a stored destination the host can still write to", () => {
    const storedId = calendarId();
    const otherId = calendarId();
    const stored = createMockCalendar({ id: storedId, name: "Work" });
    const other = createMockCalendar({ id: otherId, name: "Personal" });

    const form = buildInitialForm(
      setupPage({ destinationCalendarId: storedId }),
      zone,
      [other, stored],
      [other, stored],
    );

    expect(form.destinationCalendarId).toBe(storedId);
  });

  it("keeps the view timezone until setup is configured, then the stored one", () => {
    const stored = TimeZoneSchema.parse("Europe/Berlin");

    expect(
      buildInitialForm(setupPage({ timeZone: stored }), zone, [], []).timeZone,
    ).toBe(zone);
    expect(
      buildInitialForm(
        setupPage({ isConfigured: true, timeZone: stored }),
        zone,
        [],
        [],
      ).timeZone,
    ).toBe(stored);
  });
});
