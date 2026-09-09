import { ObjectId } from "mongodb";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import * as billingGuard from "@backend/billing/billing.guard";
import { type BookingPageRecord } from "@backend/booking/booking-page.record";
import {
  emptyBookableStatus,
  mapProbeToStatus,
  probeBookability,
} from "@backend/booking/services/booking-readiness";
import { type CalendarBookingPort } from "@backend/booking/services/calendar-booking.port";
import { eventMutationError } from "@backend/event/event.error";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

const calendarId = () => CalendarIdSchema.parse(new ObjectId().toString());
const connectionId = () => new ObjectId().toString();

const page = (
  overrides: Partial<BookingPageRecord> = {},
): BookingPageRecord => {
  const destination = calendarId();
  return {
    _id: new ObjectId(),
    userId: new ObjectId(),
    bookingSlug: "hostuser",
    enabled: true,
    durationMinutes: 30,
    destinationCalendarId: destination,
    blockingCalendarIds: [destination],
    timeZone: "UTC",
    weeklyAvailability: [{ weekday: 1, start: "09:00", end: "17:00" }],
    minNoticeHours: 4,
    maxHorizonDays: 60,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
};

const busy = (bookable: boolean, extras: Record<string, unknown> = {}) => ({
  intervals: [],
  computedAt: "2026-09-07T12:00:00.000Z",
  connections: [],
  complete: bookable,
  issues: [],
  bookable,
  ...extras,
});

const probeWindow = {
  start: new Date("2026-09-07T08:00:00.000Z"),
  end: new Date("2026-11-06T08:00:00.000Z"),
};

describe("probeBookability", () => {
  afterEach(() => {
    mock.restore();
  });
  it("reports a stale blocking calendar as unbookable", async () => {
    const blocking = calendarId();
    const getAvailability = mock(async () =>
      busy(false, {
        complete: false,
        issues: [{ calendarId: blocking, reason: "stale" }],
      }),
    );
    spyOn(billingGuard, "assertBillingAllowsWrites").mockResolvedValue(
      undefined,
    );

    const probe = await probeBookability(
      page({ blockingCalendarIds: [blocking] }),
      probeWindow,
      { getAvailability } as unknown as CalendarBookingPort,
    );

    expect(probe.bookable).toBe(false);
    expect(mapProbeToStatus(probe)).toEqual({
      bookable: false,
      reasons: [{ kind: "calendar", reason: "stale", calendarId: blocking }],
    });
  });

  it("reports an actionRequired connection as unbookable", async () => {
    const getAvailability = mock(async () =>
      busy(false, {
        connections: [
          {
            connectionId: connectionId(),
            state: "actionRequired",
            lastSyncedAt: null,
            lastHealthyAt: null,
          },
        ],
      }),
    );
    spyOn(billingGuard, "assertBillingAllowsWrites").mockResolvedValue(
      undefined,
    );

    const probe = await probeBookability(page(), probeWindow, {
      getAvailability,
    } as unknown as CalendarBookingPort);

    expect(probe.bookable).toBe(false);
    expect(mapProbeToStatus(probe)).toEqual({
      bookable: false,
      reasons: [
        {
          kind: "connection",
          reason: "actionRequired",
          connectionState: "actionRequired",
        },
      ],
    });
  });

  it("skips availability when billing blocks writes", async () => {
    const getAvailability = mock(async () => busy(true));
    spyOn(billingGuard, "assertBillingAllowsWrites").mockRejectedValue(
      eventMutationError(
        "BILLING_REQUIRED",
        "A paid subscription is required to make changes",
      ),
    );

    const probe = await probeBookability(page(), probeWindow, {
      getAvailability,
    } as unknown as CalendarBookingPort);

    expect(getAvailability).not.toHaveBeenCalled();
    expect(mapProbeToStatus(probe)).toEqual({
      bookable: false,
      reasons: [{ kind: "billing", reason: "BILLING_REQUIRED" }],
    });
  });
});

describe("emptyBookableStatus", () => {
  it("is the disabled-page and missing-page answer", () => {
    expect(emptyBookableStatus()).toEqual({ bookable: true, reasons: [] });
  });
});
