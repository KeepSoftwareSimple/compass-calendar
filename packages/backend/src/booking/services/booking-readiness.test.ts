import { ObjectId } from "mongodb";
import { CalendarIdSchema, type TimeZone } from "@core/types/domain-primitives";
import { type ProviderCalendar } from "@core/types/sync/connection.contracts";
import * as billingGuard from "@backend/billing/billing.guard";
import { type BookingPageRecord } from "@backend/booking/booking-page.record";
import { type DestinationCatalog } from "@backend/booking/services/booking-destination-readiness";
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
    timeZone: "UTC" as TimeZone,
    weeklyAvailability: [{ weekday: 1, start: "09:00", end: "17:00" }],
    minNoticeHours: 4,
    maxHorizonDays: 60,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
};

const catalogFor = (
  destination: ReturnType<typeof calendarId>,
  overrides: {
    canWriteEvents?: boolean;
    destinationState?: "healthy" | "disconnected" | "actionRequired";
    includeDestination?: boolean;
    extraCalendars?: ProviderCalendar[];
  } = {},
): DestinationCatalog => {
  const calendars: ProviderCalendar[] = [...(overrides.extraCalendars ?? [])];
  if (overrides.includeDestination !== false) {
    calendars.push({
      id: destination,
      connectionId: "conn-dest",
      capabilities: {
        canReadEvents: true,
        canWriteEvents: overrides.canWriteEvents ?? true,
        canReadBusy: true,
        canInviteAttendees: true,
      },
    } as unknown as ProviderCalendar);
  }
  return {
    calendars,
    connections: [
      {
        id: "conn-dest",
        state: overrides.destinationState ?? "healthy",
      },
      { id: "conn-block", state: "healthy" },
    ],
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
    const destination = calendarId();
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
      page({
        destinationCalendarId: destination,
        blockingCalendarIds: [blocking],
      }),
      probeWindow,
      { getAvailability } as unknown as CalendarBookingPort,
      { destinationCatalog: catalogFor(destination) },
    );

    expect(probe.bookable).toBe(false);
    expect(mapProbeToStatus(probe)).toEqual({
      bookable: false,
      reasons: [{ kind: "calendar", reason: "stale", calendarId: blocking }],
    });
  });

  it("reports an actionRequired connection as unbookable", async () => {
    const seeded = page();
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

    const probe = await probeBookability(
      seeded,
      probeWindow,
      { getAvailability } as unknown as CalendarBookingPort,
      { destinationCatalog: catalogFor(seeded.destinationCalendarId) },
    );

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

  it("does not let a healthy blocking calendar mask a disconnected destination", async () => {
    const destination = calendarId();
    const blocking = calendarId();
    const getAvailability = mock(async () => busy(true));
    spyOn(billingGuard, "assertBillingAllowsWrites").mockResolvedValue(
      undefined,
    );

    const probe = await probeBookability(
      page({
        destinationCalendarId: destination,
        blockingCalendarIds: [blocking],
      }),
      probeWindow,
      { getAvailability } as unknown as CalendarBookingPort,
      {
        destinationCatalog: catalogFor(destination, {
          destinationState: "disconnected",
        }),
      },
    );

    expect(probe.bookable).toBe(false);
    expect(getAvailability).toHaveBeenCalled();
    expect(mapProbeToStatus(probe)).toEqual({
      bookable: false,
      reasons: [
        {
          kind: "connection",
          reason: "disconnected",
          connectionState: "disconnected",
        },
      ],
    });
  });

  it("hides bookability when the destination is missing or read-only", async () => {
    const destination = calendarId();
    const getAvailability = mock(async () => busy(true));
    spyOn(billingGuard, "assertBillingAllowsWrites").mockResolvedValue(
      undefined,
    );

    const missing = await probeBookability(
      page({ destinationCalendarId: destination }),
      probeWindow,
      { getAvailability } as unknown as CalendarBookingPort,
      {
        destinationCatalog: catalogFor(destination, {
          includeDestination: false,
        }),
      },
    );
    expect(mapProbeToStatus(missing)).toMatchObject({
      bookable: false,
      reasons: [{ kind: "calendar", reason: "notImported" }],
    });

    const readOnly = await probeBookability(
      page({ destinationCalendarId: destination }),
      probeWindow,
      { getAvailability } as unknown as CalendarBookingPort,
      {
        destinationCatalog: catalogFor(destination, { canWriteEvents: false }),
      },
    );
    expect(mapProbeToStatus(readOnly)).toEqual({
      bookable: false,
      reasons: [
        {
          kind: "calendar",
          reason: "notWritable",
          calendarId: destination,
        },
      ],
    });
  });
});

describe("emptyBookableStatus", () => {
  it("is the disabled-page and missing-page answer", () => {
    expect(emptyBookableStatus()).toEqual({ bookable: true, reasons: [] });
  });
});
