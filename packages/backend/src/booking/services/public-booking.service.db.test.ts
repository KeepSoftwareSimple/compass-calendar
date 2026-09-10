import { ObjectId } from "mongodb";
import { BaseError } from "@core/errors/errors.base";
import { Status } from "@core/errors/status.codes";
import { AdminPutBookingPageInputSchema } from "@core/types/booking.contracts";
import {
  type CommandSubmitRequest,
  type SyncCommandInput,
} from "@core/types/sync/command.contracts";
import { BaseDriver } from "@backend/__tests__/drivers/base.driver";
import { UserDriver } from "@backend/__tests__/drivers/user.driver";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import * as billingGuard from "@backend/billing/billing.guard";
import {
  generateCancelToken,
  hashCancelToken,
} from "@backend/booking/booking-cancel-token";
import { ensureBookingIndexes } from "@backend/booking/booking-indexes";
import { bookingReservationRepository } from "@backend/booking/booking-reservation.repository";
import bookingPageService from "@backend/booking/services/booking-page.service";
import { type CalendarBookingPort } from "@backend/booking/services/calendar-booking.port";
import { CalendarBookingService } from "@backend/booking/services/calendar-booking.service";
import {
  PublicBookingService,
  publicBookingCompensationLog,
  publicBookingSlotsLog,
} from "@backend/booking/services/public-booking.service";
import calendarService from "@backend/calendar/services/calendar.service";
import { type SyncServiceClient } from "@backend/common/services/sync-service/sync-service.client";
import * as syncServiceFactory from "@backend/common/services/sync-service/sync-service.factory";
import { eventMutationError } from "@backend/event/event.error";
import userService from "@backend/user/services/user.service";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
  spyOn,
} from "bun:test";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const utcDatePlusDays = (isoDate: string, days: number): string => {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days))
    .toISOString()
    .slice(0, 10);
};

/** Upcoming Monday in UTC, skipping today so 09:00-17:00 slots stay bookable. */
const nextUtcMonday = (): string => {
  const now = new Date();
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const weekday = new Date(todayUtc).getUTCDay();
  const daysUntilMonday = weekday === 1 ? 7 : (8 - weekday) % 7;
  return new Date(todayUtc + daysUntilMonday * 86_400_000)
    .toISOString()
    .slice(0, 10);
};

const BOOKING_MONDAY = nextUtcMonday();
const BOOKING_TUESDAY = utcDatePlusDays(BOOKING_MONDAY, 1);

const calendarId = () => new ObjectId().toString();

const writableCalendar = (id = calendarId()) => ({
  id,
  tenantId: new ObjectId().toString(),
  principalId: new ObjectId().toString(),
  connectionId: new ObjectId().toString(),
  providerCalendarId: "primary",
  displayName: "Work",
  color: "#9fe1e7",
  active: true,
  primary: true,
  accessRole: "owner" as const,
  capabilities: {
    canReadEvents: true,
    canWriteEvents: true,
    canReadBusy: true,
    canInviteAttendees: true,
  },
  createsGoogleMeet: true,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-20T12:00:00.000Z",
});

const healthyConnection = () => ({
  id: new ObjectId().toString(),
  tenantId: new ObjectId().toString(),
  principalId: new ObjectId().toString(),
  provider: "google" as const,
  account: {
    providerAccountId: "112233445566778899000",
    email: "user@gmail.com",
    displayName: "Test User",
  },
  capabilities: ["readEvents", "writeEvents"] as const,
  state: "healthy" as const,
  stateReason: null,
  lastSyncedAt: "2026-07-20T12:00:00.000Z",
  lastHealthyAt: "2026-07-20T12:00:00.000Z",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-20T12:00:00.000Z",
});

const appleConnection = () => ({
  ...healthyConnection(),
  provider: "apple" as const,
  account: {
    providerAccountId: "apple-principal",
    email: "host@icloud.com",
    displayName: "Apple Host",
  },
});

type TestSyncConnection =
  | ReturnType<typeof healthyConnection>
  | ReturnType<typeof appleConnection>
  | ReturnType<typeof microsoftConnection>;

const submitRequestFrom = (submitCommand: {
  mock: { calls: unknown[][] };
}): CommandSubmitRequest => {
  const request = submitCommand.mock.calls[0]?.[1];
  if (!request) {
    throw new Error("Expected submitCommand to have been called");
  }
  return request as CommandSubmitRequest;
};

const createInputFrom = (submitCommand: {
  mock: { calls: unknown[][] };
}): Extract<SyncCommandInput, { kind: "create" }> => {
  const request = submitRequestFrom(submitCommand);
  if (request.input.kind !== "create") {
    throw new Error("Expected a create command submit");
  }
  return request.input;
};

const microsoftConnection = (withTeams = true) => ({
  ...healthyConnection(),
  provider: "microsoft" as const,
  account: {
    providerAccountId: "microsoft-principal",
    email: "host@outlook.com",
    displayName: "Microsoft Host",
  },
  capabilities: withTeams
    ? (["readEvents", "writeEvents", "createTeamsMeeting"] as const)
    : (["readEvents", "writeEvents"] as const),
});

const samplePutInput = (overrides: Record<string, unknown> = {}) => {
  const destination = calendarId();
  return AdminPutBookingPageInputSchema.parse({
    enabled: true,
    durationMinutes: 30,
    destinationCalendarId: destination,
    blockingCalendarIds: [destination],
    timeZone: "UTC",
    weeklyAvailability: [{ weekday: 1, start: "09:00", end: "17:00" }],
    minNoticeHours: 0,
    maxHorizonDays: 60,
    ...overrides,
  });
};

const createNamedUser = async (name: string) => {
  const created = await userService.createUser(
    UserDriver.generateGoogleUser({ name }),
  );
  return new ObjectId(created.userId);
};

const busyResponse = (bookable = true) => ({
  intervals: [],
  computedAt: `${BOOKING_MONDAY}T12:00:00.000Z`,
  connections: [],
  complete: true,
  issues: [],
  bookable,
});

describe("PublicBookingService", () => {
  let syncSpies: Array<{ mockRestore: () => void }> = [];
  let createBookingEvent: ReturnType<typeof mock>;
  let deleteBookingEvent: ReturnType<typeof mock>;
  let updateBookingEvent: ReturnType<typeof mock>;
  let getAvailability: ReturnType<typeof mock>;
  let service: PublicBookingService;

  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await ensureBookingIndexes();
    // Every slot below is pinned to Monday 2026-09-07, inside the fixture's
    // weekday-1 09:00-17:00 window. assertSlotAvailable rejects a slot that
    // starts before now + minNoticeHours, so with the real clock these tests
    // passed only until 2026-09-07T10:00:00Z and then failed forever. Freeze
    // "now" to that morning instead of re-pinning the dates: shifting them a
    // day would move them off weekday 1 and out of the window. Set after the
    // Mongo connection is established so the driver's own timeouts are
    // measured against the real clock.
    setSystemTime(new Date("2026-09-07T08:00:00.000Z"));
  });

  beforeEach(async () => {
    await cleanupCollections();
    syncSpies.forEach((spy) => spy.mockRestore());
    syncSpies = [];

    createBookingEvent = mock(async () => new ObjectId().toString());
    deleteBookingEvent = mock(async () => undefined);
    updateBookingEvent = mock(async () => undefined);
    getAvailability = mock(async () => busyResponse(true));

    const port: CalendarBookingPort = {
      getAvailability,
      createBookingEvent,
      updateBookingEvent,
      deleteBookingEvent,
    };
    service = new PublicBookingService(port);
  });

  afterAll(async () => {
    setSystemTime();
    await cleanupTestDb();
  });

  const mockHealthySync = (
    calendars: ReturnType<typeof writableCalendar>[],
    connection: TestSyncConnection = healthyConnection(),
  ) => {
    const wired = calendars.map((calendar) => ({
      ...calendar,
      connectionId: connection.id,
    }));
    syncSpies.push(
      spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
        listConnections: mock(() =>
          Promise.resolve({
            ok: true as const,
            value: { connections: [connection] },
          }),
        ),
        listCalendars: mock(() =>
          Promise.resolve({
            ok: true as const,
            value: { calendars: wired },
          }),
        ),
      } as never),
    );
    return { connection, calendars: wired };
  };

  const enableBookingPage = async (
    slugName = "Host User",
    overrides: Record<string, unknown> = {},
  ) => {
    const userId = await createNamedUser(slugName);
    const calendar = writableCalendar();
    mockHealthySync([calendar]);
    spyOn(billingGuard, "assertBillingAllowsWrites").mockResolvedValue(
      undefined,
    );
    const page = await bookingPageService.putAdminPage(
      userId,
      samplePutInput({
        destinationCalendarId: calendar.id,
        blockingCalendarIds: [calendar.id],
        ...overrides,
      }),
    );
    const slug = "slug" in page ? page.slug : "";
    const pageId = "id" in page ? new ObjectId(page.id) : new ObjectId();
    return { userId, slug, calendarId: calendar.id, pageId };
  };

  const seedConfirmedReservation = async (
    pageId: ObjectId,
    slotStart: string,
    slotEnd: string,
  ) =>
    bookingReservationRepository.insert({
      _id: new ObjectId(),
      pageId,
      slotStart: new Date(slotStart),
      slotEnd: new Date(slotEnd),
      guestName: "Rival Guest",
      guestEmail: "rival@example.com",
      notes: null,
      guestTimeZone: "UTC",
      status: "confirmed",
      calendarEventId: "rival-evt",
      cancelTokenHash: "b".repeat(64),
    });

  it("returns 404-equivalent for disabled slug via PAGE_NOT_FOUND", async () => {
    const userId = await createNamedUser("Disabled Host");
    const calendar = writableCalendar();
    mockHealthySync([calendar]);
    spyOn(billingGuard, "assertBillingAllowsWrites").mockResolvedValue(
      undefined,
    );
    const page = await bookingPageService.putAdminPage(
      userId,
      samplePutInput({
        enabled: false,
        destinationCalendarId: calendar.id,
        blockingCalendarIds: [calendar.id],
      }),
    );
    expect("slug" in page).toBe(false);

    await expect(service.getPublicPage("missingpage")).rejects.toMatchObject({
      bookingCode: "PAGE_NOT_FOUND",
    });
  });

  it("returns PAGE_NOT_FOUND for the old slug after a rename", async () => {
    const userId = await createNamedUser("Rename Public Host");
    const calendar = writableCalendar();
    mockHealthySync([calendar]);
    spyOn(billingGuard, "assertBillingAllowsWrites").mockResolvedValue(
      undefined,
    );
    const input = samplePutInput({
      destinationCalendarId: calendar.id,
      blockingCalendarIds: [calendar.id],
    });
    const page = await bookingPageService.putAdminPage(userId, input);
    const oldSlug = "slug" in page ? page.slug : "";
    expect(oldSlug).toBe("renamepublichost");

    const renamed = await bookingPageService.putAdminPage(userId, {
      ...input,
      slug: "new-public-slug",
    });
    expect("slug" in renamed && renamed.slug).toBe("new-public-slug");

    await expect(service.getPublicPage(oldSlug)).rejects.toMatchObject({
      bookingCode: "PAGE_NOT_FOUND",
    });

    const publicPage = await service.getPublicPage("new-public-slug");
    expect(publicPage).toEqual(
      expect.objectContaining({
        hostDisplayName: "Rename Public Host",
        enabled: true,
      }),
    );
  });

  it("confirms a reservation and calls createBookingEvent once", async () => {
    const { slug } = await enableBookingPage();
    const slotStart = `${BOOKING_MONDAY}T10:00:00.000Z`;

    const response = await service.createReservation(slug, {
      slotStart,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });

    expect(createBookingEvent).toHaveBeenCalledTimes(1);
    expect(
      (createBookingEvent.mock.calls as unknown[][])[0]?.[1],
    ).toMatchObject({
      guest: { email: "ada@example.com", displayName: "Ada Lovelace" },
    });
    expect(response.reservationId).toBeTruthy();
    expect(response.cancelUrl).toContain("token=");
    expect(response.rescheduleUrl).toContain("token=");
    expect(response.cancelUrl).toContain("/meet/cancel/");
    expect(response.rescheduleUrl).toContain("/meet/reschedule/");
  });

  it("confirms at the pinned duration and calls createBookingEvent once", async () => {
    const { slug } = await enableBookingPage();
    const slotStart = `${BOOKING_MONDAY}T10:00:00.000Z`;

    const response = await service.createReservation(slug, {
      slotStart,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });

    expect(createBookingEvent).toHaveBeenCalledTimes(1);
    expect(
      (createBookingEvent.mock.calls as unknown[][])[0]?.[1],
    ).toMatchObject({
      start: slotStart,
      end: `${BOOKING_MONDAY}T10:30:00.000Z`,
    });
    expect(response.slotStart).toBe(slotStart);
    expect(response.slotEnd).toBe(`${BOOKING_MONDAY}T10:30:00.000Z`);
  });

  it("rejects confirm when pinned duration does not match the page", async () => {
    const { slug, userId, calendarId } = await enableBookingPage();
    spyOn(billingGuard, "assertBillingAllowsWrites").mockResolvedValue(
      undefined,
    );
    await bookingPageService.putAdminPage(
      userId,
      samplePutInput({
        destinationCalendarId: calendarId,
        blockingCalendarIds: [calendarId],
        durationMinutes: 45,
      }),
    );

    await expect(
      service.createReservation(slug, {
        slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
        guestName: "Ada Lovelace",
        guestEmail: "ada@example.com",
        guestTimeZone: "Europe/London",
        durationMinutes: 30,
      }),
    ).rejects.toMatchObject({
      bookingCode: "SLOT_UNAVAILABLE",
      statusCode: Status.CONFLICT,
    });
    expect(createBookingEvent).not.toHaveBeenCalled();
  });

  it("rejects confirm extra keys before creating an event", async () => {
    const { slug } = await enableBookingPage();

    await expect(
      service.createReservation(slug, {
        slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
        guestName: "Ada Lovelace",
        guestEmail: "ada@example.com",
        guestTimeZone: "Europe/London",
        durationMinutes: 30,
        extra: true,
      }),
    ).rejects.toThrow();
    expect(createBookingEvent).not.toHaveBeenCalled();
  });

  it("rejects confirm when bookable is false without creating an event", async () => {
    const { slug } = await enableBookingPage();
    getAvailability.mockImplementation(async () => busyResponse(false));

    await expect(
      service.createReservation(slug, {
        slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
        guestName: "Ada Lovelace",
        guestEmail: "ada@example.com",
        guestTimeZone: "Europe/London",
        durationMinutes: 30,
      }),
    ).rejects.toMatchObject({ bookingCode: "SLOT_UNAVAILABLE" });

    expect(createBookingEvent).not.toHaveBeenCalled();
  });

  it("rejects confirm when the host cannot write and submits no create command", async () => {
    const { slug } = await enableBookingPage();
    spyOn(billingGuard, "assertBillingAllowsWrites").mockRejectedValue(
      eventMutationError(
        "BILLING_REQUIRED",
        "A paid subscription is required to make changes",
      ),
    );

    const error = await service
      .createReservation(slug, {
        slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
        guestName: "Ada Lovelace",
        guestEmail: "ada@example.com",
        guestTimeZone: "Europe/London",
        durationMinutes: 30,
      })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      bookingCode: "SLOT_UNAVAILABLE",
      message: "This page is not accepting meetings.",
    });
    expect(JSON.stringify(error)).not.toMatch(
      /billing|plan|payment|paid|subscription/i,
    );
    expect(createBookingEvent).not.toHaveBeenCalled();
  });

  it("returns unbookable slots when the host cannot write", async () => {
    const { slug } = await enableBookingPage();
    spyOn(billingGuard, "assertBillingAllowsWrites").mockRejectedValue(
      eventMutationError(
        "BILLING_REQUIRED",
        "A paid subscription is required to make changes",
      ),
    );

    const response = await service.getSlots(slug, {
      start: `${BOOKING_MONDAY}T00:00:00.000Z`,
      end: `${BOOKING_TUESDAY}T00:00:00.000Z`,
      timeZone: "UTC",
    });

    expect(response).toEqual({ slots: [], bookable: false });
    expect(getAvailability).not.toHaveBeenCalled();
  });

  it("rejects public page GET when the host cannot write without billing wording", async () => {
    const { slug } = await enableBookingPage();
    spyOn(billingGuard, "assertBillingAllowsWrites").mockRejectedValue(
      eventMutationError(
        "BILLING_REQUIRED",
        "A paid subscription is required to make changes",
      ),
    );

    const error = await service
      .getPublicPage(slug)
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      bookingCode: "SLOT_UNAVAILABLE",
      message: "This page is not accepting meetings.",
    });
    expect(JSON.stringify(error)).not.toMatch(
      /billing|plan|payment|paid|subscription/i,
    );
  });

  it("rejects slot not in engine output", async () => {
    const { slug } = await enableBookingPage();
    getAvailability.mockImplementation(async () => ({
      ...busyResponse(true),
      intervals: [
        {
          start: `${BOOKING_MONDAY}T10:00:00.000Z`,
          end: `${BOOKING_MONDAY}T11:00:00.000Z`,
        },
      ],
    }));

    await expect(
      service.createReservation(slug, {
        slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
        guestName: "Ada Lovelace",
        guestEmail: "ada@example.com",
        guestTimeZone: "Europe/London",
        durationMinutes: 30,
      }),
    ).rejects.toMatchObject({ bookingCode: "SLOT_UNAVAILABLE" });

    expect(createBookingEvent).not.toHaveBeenCalled();
  });

  it("returns empty slots with bookable false without leaking busy payloads", async () => {
    const { slug } = await enableBookingPage();
    getAvailability.mockImplementation(async () => ({
      ...busyResponse(false),
      intervals: [
        {
          start: `${BOOKING_MONDAY}T10:00:00.000Z`,
          end: `${BOOKING_MONDAY}T11:00:00.000Z`,
        },
      ],
    }));

    const response = await service.getSlots(slug, {
      start: `${BOOKING_MONDAY}T00:00:00.000Z`,
      end: `${BOOKING_TUESDAY}T00:00:00.000Z`,
      timeZone: "UTC",
    });

    expect(response).toEqual({ slots: [], bookable: false });
    expect(JSON.stringify(response)).not.toContain("intervals");
  });

  it("logs slug and issueCalendarIds when slots are unbookable", async () => {
    const { slug, userId, calendarId } = await enableBookingPage();
    getAvailability.mockImplementation(async () => ({
      ...busyResponse(false),
      complete: false,
      issues: [{ calendarId, reason: "stale" }],
    }));
    const logSpy = spyOn(publicBookingSlotsLog, "unbookable");

    await service.getSlots(slug, {
      start: `${BOOKING_MONDAY}T00:00:00.000Z`,
      end: `${BOOKING_TUESDAY}T00:00:00.000Z`,
      timeZone: "UTC",
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect((logSpy.mock.calls as unknown[][])[0]?.[0]).toMatchObject({
      slug,
      userId: userId.toString(),
      issueCalendarIds: [calendarId],
    });
  });

  it("reports a stale blocking calendar on host status and keeps slots unbookable", async () => {
    const { userId, slug, calendarId } = await enableBookingPage();
    getAvailability.mockImplementation(async () => ({
      ...busyResponse(false),
      complete: false,
      issues: [{ calendarId, reason: "stale" }],
    }));

    await expect(service.getHostPageStatus(userId)).resolves.toEqual({
      bookable: false,
      reasons: [{ kind: "calendar", reason: "stale", calendarId }],
    });
    await expect(
      service.getSlots(slug, {
        start: `${BOOKING_MONDAY}T00:00:00.000Z`,
        end: `${BOOKING_TUESDAY}T00:00:00.000Z`,
        timeZone: "UTC",
      }),
    ).resolves.toEqual({ slots: [], bookable: false });
  });

  it("reports an actionRequired connection on host status", async () => {
    const { userId } = await enableBookingPage();
    getAvailability.mockImplementation(async () => ({
      ...busyResponse(false),
      connections: [
        {
          connectionId: new ObjectId().toString(),
          state: "actionRequired",
          lastSyncedAt: null,
          lastHealthyAt: null,
        },
      ],
    }));

    await expect(service.getHostPageStatus(userId)).resolves.toEqual({
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

  it("answers bookable with no reasons for a disabled page", async () => {
    const { userId } = await enableBookingPage("Disabled Host", {
      enabled: false,
    });

    await expect(service.getHostPageStatus(userId)).resolves.toEqual({
      bookable: true,
      reasons: [],
    });
    expect(getAvailability).not.toHaveBeenCalled();
  });

  it("answers bookable with no reasons when the host has no page", async () => {
    const userId = await createNamedUser("No Page Host");

    await expect(service.getHostPageStatus(userId)).resolves.toEqual({
      bookable: true,
      reasons: [],
    });
    expect(getAvailability).not.toHaveBeenCalled();
  });

  it("does not occupy a slot for a needsAction invite", async () => {
    const { slug } = await enableBookingPage();
    getAvailability.mockImplementation(async () => ({
      ...busyResponse(true),
      intervals: [
        {
          start: `${BOOKING_MONDAY}T10:00:00.000Z`,
          end: `${BOOKING_MONDAY}T11:00:00.000Z`,
          hostIsOrganizer: false,
          hostResponseStatus: "needsAction",
        },
      ],
    }));

    const response = await service.getSlots(slug, {
      start: `${BOOKING_MONDAY}T00:00:00.000Z`,
      end: `${BOOKING_TUESDAY}T00:00:00.000Z`,
      timeZone: "UTC",
    });

    expect(
      response.slots.some(
        (slot) =>
          Date.parse(slot.slotStart) ===
          Date.parse(`${BOOKING_MONDAY}T10:00:00.000Z`),
      ),
    ).toBe(true);
  });

  it("occupies a slot when the host organized the busy interval", async () => {
    const { slug } = await enableBookingPage();
    getAvailability.mockImplementation(async () => ({
      ...busyResponse(true),
      intervals: [
        {
          start: `${BOOKING_MONDAY}T10:00:00.000Z`,
          end: `${BOOKING_MONDAY}T11:00:00.000Z`,
          hostIsOrganizer: true,
          hostResponseStatus: null,
        },
      ],
    }));

    const response = await service.getSlots(slug, {
      start: `${BOOKING_MONDAY}T00:00:00.000Z`,
      end: `${BOOKING_TUESDAY}T00:00:00.000Z`,
      timeZone: "UTC",
    });

    expect(
      response.slots.some(
        (slot) =>
          Date.parse(slot.slotStart) ===
          Date.parse(`${BOOKING_MONDAY}T10:00:00.000Z`),
      ),
    ).toBe(false);
  });

  it("occupies a Compass-local busy interval and fail-closes confirmation", async () => {
    const userId = await createNamedUser("Compass Host");
    const calendar = writableCalendar();
    mockHealthySync([calendar]);
    spyOn(billingGuard, "assertBillingAllowsWrites").mockResolvedValue(
      undefined,
    );
    await calendarService.ensureLocalCalendar(userId);
    const localCalendar = await calendarService.getLocalCalendar(userId);
    if (!localCalendar) {
      throw new Error("expected Compass-local calendar after user create");
    }
    const localId = localCalendar._id.toHexString();
    const page = await bookingPageService.putAdminPage(
      userId,
      samplePutInput({
        destinationCalendarId: calendar.id,
        blockingCalendarIds: [calendar.id, localId],
      }),
    );
    const slug = "slug" in page ? page.slug : "";

    getAvailability.mockImplementation(async (_userId, query) => {
      expect(query.calendarIds).toEqual(
        expect.arrayContaining([calendar.id, localId]),
      );
      return {
        ...busyResponse(true),
        intervals: [
          {
            start: `${BOOKING_MONDAY}T10:00:00.000Z`,
            end: `${BOOKING_MONDAY}T11:00:00.000Z`,
            hostIsOrganizer: true,
            hostResponseStatus: null,
          },
        ],
      };
    });

    const slots = await service.getSlots(slug, {
      start: `${BOOKING_MONDAY}T00:00:00.000Z`,
      end: `${BOOKING_TUESDAY}T00:00:00.000Z`,
      timeZone: "UTC",
    });
    expect(
      slots.slots.some(
        (slot) =>
          Date.parse(slot.slotStart) ===
          Date.parse(`${BOOKING_MONDAY}T10:00:00.000Z`),
      ),
    ).toBe(false);

    getAvailability.mockImplementation(async (_userId, query) => {
      expect(query.calendarIds).toEqual(
        expect.arrayContaining([calendar.id, localId]),
      );
      return busyResponse(false);
    });

    await expect(
      service.createReservation(slug, {
        slotStart: `${BOOKING_MONDAY}T12:00:00.000Z`,
        guestName: "Ada Lovelace",
        guestEmail: "ada@example.com",
        guestTimeZone: "Europe/London",
        durationMinutes: 30,
      }),
    ).rejects.toMatchObject({ bookingCode: "SLOT_UNAVAILABLE" });
    expect(createBookingEvent).not.toHaveBeenCalled();
  });

  it("does not expose removed public page fields", async () => {
    const { slug } = await enableBookingPage("Public Host");

    const page = await service.getPublicPage(slug);

    expect(page).not.toHaveProperty("welcomeText");
    expect(page).not.toHaveProperty("dateOverrides");
  });

  it("carries createsGoogleMeet true when the destination can mint Meet", async () => {
    const { slug } = await enableBookingPage();
    const page = await service.getPublicPage(slug);
    expect(page.createsGoogleMeet).toBe(true);
    expect(page.conference).toBe("meet");
  });

  it("carries createsGoogleMeet false when the destination cannot mint Meet", async () => {
    const userId = await createNamedUser("No Meet Host");
    const calendar = { ...writableCalendar(), createsGoogleMeet: false };
    mockHealthySync([calendar]);
    spyOn(billingGuard, "assertBillingAllowsWrites").mockResolvedValue(
      undefined,
    );
    const page = await bookingPageService.putAdminPage(
      userId,
      samplePutInput({
        destinationCalendarId: calendar.id,
        blockingCalendarIds: [calendar.id],
      }),
    );
    const slug = "slug" in page ? page.slug : "";

    const publicPage = await service.getPublicPage(slug);
    expect(publicPage.createsGoogleMeet).toBe(false);
    expect(publicPage.conference).toBe("none");

    const created = await service.createReservation(slug, {
      slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });
    const publicReservation = await service.getPublicReservation(
      new ObjectId(created.reservationId),
    );
    expect(publicReservation.createsGoogleMeet).toBe(false);
    expect(publicReservation.conference).toBe("none");
  });

  it("books through an Apple destination without a conference link", async () => {
    const userId = await createNamedUser("Apple Host");
    const calendar = writableCalendar();
    const connection = appleConnection();
    mockHealthySync([calendar], connection);
    spyOn(billingGuard, "assertBillingAllowsWrites").mockResolvedValue(
      undefined,
    );
    const page = await bookingPageService.putAdminPage(
      userId,
      samplePutInput({
        destinationCalendarId: calendar.id,
        blockingCalendarIds: [calendar.id],
      }),
    );
    const slug = "slug" in page ? page.slug : "";

    const publicPage = await service.getPublicPage(slug);
    expect(publicPage.createsGoogleMeet).toBe(false);
    expect(publicPage.conference).toBe("none");

    const submitCommand = mock(async () => ({
      ok: true as const,
      value: { commandId: new ObjectId().toString() },
    }));
    spyOn(calendarService, "getLocalCalendar").mockResolvedValue(null);
    const bookingService = new PublicBookingService(
      new CalendarBookingService({
        queryBusyAvailability: mock(async () => ({
          ok: true as const,
          value: busyResponse(true),
        })),
        submitCommand,
      } as unknown as SyncServiceClient),
    );

    const created = await bookingService.createReservation(slug, {
      slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      notes: "Zoom: https://example.com/meet",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });

    expect(submitCommand).toHaveBeenCalledTimes(1);
    const input = createInputFrom(submitCommand);
    expect(input.createConference).toBe(false);
    expect(input.content.conference).toBeNull();
    expect(input.content.description).toContain(
      "Zoom: https://example.com/meet",
    );

    const publicReservation = await bookingService.getPublicReservation(
      new ObjectId(created.reservationId),
    );
    expect(publicReservation.createsGoogleMeet).toBe(false);
    expect(publicReservation.conference).toBe("none");
  });

  it("books through a Microsoft destination with Teams conferencing", async () => {
    const userId = await createNamedUser("Teams Host");
    const calendar = writableCalendar();
    const connection = microsoftConnection(true);
    mockHealthySync([calendar], connection);
    spyOn(billingGuard, "assertBillingAllowsWrites").mockResolvedValue(
      undefined,
    );
    const page = await bookingPageService.putAdminPage(
      userId,
      samplePutInput({
        destinationCalendarId: calendar.id,
        blockingCalendarIds: [calendar.id],
      }),
    );
    const slug = "slug" in page ? page.slug : "";

    const publicPage = await service.getPublicPage(slug);
    expect(publicPage.createsGoogleMeet).toBe(false);
    expect(publicPage.conference).toBe("teams");

    const submitCommand = mock(async () => ({
      ok: true as const,
      value: { commandId: new ObjectId().toString() },
    }));
    spyOn(calendarService, "getLocalCalendar").mockResolvedValue(null);
    const bookingService = new PublicBookingService(
      new CalendarBookingService({
        queryBusyAvailability: mock(async () => ({
          ok: true as const,
          value: busyResponse(true),
        })),
        submitCommand,
      } as unknown as SyncServiceClient),
    );

    const created = await bookingService.createReservation(slug, {
      slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });

    expect(submitCommand).toHaveBeenCalledTimes(1);
    const input = createInputFrom(submitCommand);
    expect(input.createConference).toBe(true);
    expect(input.content.conference).toBeNull();

    const publicReservation = await bookingService.getPublicReservation(
      new ObjectId(created.reservationId),
    );
    expect(publicReservation.conference).toBe("teams");
  });

  it("books through a Microsoft destination without Teams conferencing", async () => {
    const userId = await createNamedUser("No Teams Host");
    const calendar = writableCalendar();
    const connection = microsoftConnection(false);
    mockHealthySync([calendar], connection);
    spyOn(billingGuard, "assertBillingAllowsWrites").mockResolvedValue(
      undefined,
    );
    const page = await bookingPageService.putAdminPage(
      userId,
      samplePutInput({
        destinationCalendarId: calendar.id,
        blockingCalendarIds: [calendar.id],
      }),
    );
    const slug = "slug" in page ? page.slug : "";

    const publicPage = await service.getPublicPage(slug);
    expect(publicPage.conference).toBe("none");

    const submitCommand = mock(async () => ({
      ok: true as const,
      value: { commandId: new ObjectId().toString() },
    }));
    spyOn(calendarService, "getLocalCalendar").mockResolvedValue(null);
    const bookingService = new PublicBookingService(
      new CalendarBookingService({
        queryBusyAvailability: mock(async () => ({
          ok: true as const,
          value: busyResponse(true),
        })),
        submitCommand,
      } as unknown as SyncServiceClient),
    );

    await bookingService.createReservation(slug, {
      slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });

    expect(submitCommand).toHaveBeenCalledTimes(1);
    const input = createInputFrom(submitCommand);
    expect(input.createConference).toBe(false);
    expect(input.content.conference).toBeNull();
  });

  it("clamps a requested window that extends past the host horizon", async () => {
    const userId = await createNamedUser("Short Horizon Host");
    const calendar = writableCalendar();
    mockHealthySync([calendar]);
    spyOn(billingGuard, "assertBillingAllowsWrites").mockResolvedValue(
      undefined,
    );
    const page = await bookingPageService.putAdminPage(
      userId,
      samplePutInput({
        destinationCalendarId: calendar.id,
        blockingCalendarIds: [calendar.id],
        maxHorizonDays: 7,
      }),
    );
    const slug = "slug" in page ? page.slug : "";
    const start = new Date();
    const end = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);

    const response = await service.getSlots(slug, {
      start: start.toISOString(),
      end: end.toISOString(),
      timeZone: "UTC",
    });

    expect(response.bookable).toBe(true);
    const horizonMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
    for (const slot of response.slots) {
      expect(Date.parse(slot.slotStart)).toBeLessThan(horizonMs + 1000);
    }
    const availabilityQuery = (
      getAvailability.mock.calls as unknown[][]
    )[0]?.[1] as {
      end: string;
    };
    expect(Date.parse(availabilityQuery.end)).toBeLessThanOrEqual(
      horizonMs + 2000,
    );
  });

  it("accepts a month-length slot window within the existing 60-day cap", async () => {
    const { slug } = await enableBookingPage();
    const response = await service.getSlots(slug, {
      start: `${BOOKING_MONDAY}T00:00:00.000Z`,
      end: `${utcDatePlusDays(BOOKING_MONDAY, 31)}T00:00:00.000Z`,
      timeZone: "UTC",
    });

    expect(response.bookable).toBe(true);
    expect(Array.isArray(response.slots)).toBe(true);
  });

  it("still rejects a slot window whose end is not after start", async () => {
    const { slug } = await enableBookingPage();

    await expect(
      service.getSlots(slug, {
        start: `${BOOKING_TUESDAY}T00:00:00.000Z`,
        end: `${BOOKING_MONDAY}T00:00:00.000Z`,
        timeZone: "UTC",
      }),
    ).rejects.toMatchObject({ bookingCode: "INVALID_INPUT" });
  });

  it("cancels idempotently", async () => {
    const { slug } = await enableBookingPage();
    const slotStart = `${BOOKING_MONDAY}T10:00:00.000Z`;
    const created = await service.createReservation(slug, {
      slotStart,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });

    const token = new URL(created.cancelUrl).searchParams.get("token");
    expect(token).toBeTruthy();

    const reservationId = new ObjectId(created.reservationId);
    await service.cancelReservation(reservationId, { token });
    await service.cancelReservation(reservationId, { token });

    expect(deleteBookingEvent).toHaveBeenCalledTimes(1);
    const stored = await bookingReservationRepository.findById(reservationId);
    expect(stored?.status).toBe("cancelled");
  });

  it("marks cancelled before delete so a failed provider delete does not keep the slot", async () => {
    const { slug } = await enableBookingPage();
    const slotStart = `${BOOKING_MONDAY}T10:00:00.000Z`;
    const created = await service.createReservation(slug, {
      slotStart,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });
    const token = new URL(created.cancelUrl).searchParams.get("token");
    expect(token).toBeTruthy();
    const reservationId = new ObjectId(created.reservationId);

    deleteBookingEvent.mockImplementation(async () => {
      throw new BaseError(
        "SYNC_UNAVAILABLE",
        "could not delete the booking event",
        Status.SERVICE_UNAVAILABLE,
        true,
      );
    });

    await expect(
      service.cancelReservation(reservationId, { token }),
    ).rejects.toMatchObject({ result: "SYNC_UNAVAILABLE" });
    expect(deleteBookingEvent).toHaveBeenCalledTimes(1);
    const stored = await bookingReservationRepository.findById(reservationId);
    expect(stored?.status).toBe("cancelled");
    expect(stored?.calendarEventId).toBeTruthy();

    const retry = await service.createReservation(slug, {
      slotStart,
      guestName: "Grace Hopper",
      guestEmail: "grace@example.com",
      guestTimeZone: "America/New_York",
      durationMinutes: 30,
    });
    expect(retry.reservationId).toBeTruthy();

    deleteBookingEvent.mockImplementation(async () => undefined);
    await service.cancelReservation(reservationId, { token });
    expect(deleteBookingEvent).toHaveBeenCalledTimes(2);
    const afterRetry =
      await bookingReservationRepository.findById(reservationId);
    expect(afterRetry?.status).toBe("cancelled");
    expect(afterRetry?.calendarEventId).toBeNull();
  });

  it("rejects an expired cancel token at slotEnd with RESERVATION_NOT_FOUND", async () => {
    const { pageId } = await enableBookingPage();
    const token = generateCancelToken();
    const reservationId = new ObjectId();
    await bookingReservationRepository.insert({
      _id: reservationId,
      pageId,
      slotStart: new Date("2025-09-07T10:00:00.000Z"),
      slotEnd: new Date("2025-09-07T10:30:00.000Z"),
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      notes: null,
      guestTimeZone: "UTC",
      status: "confirmed",
      calendarEventId: "past-evt",
      cancelTokenHash: hashCancelToken(token),
    });

    await expect(
      service.cancelReservation(reservationId, { token }),
    ).rejects.toMatchObject({ bookingCode: "RESERVATION_NOT_FOUND" });
    expect(deleteBookingEvent).not.toHaveBeenCalled();
    const stored = await bookingReservationRepository.findById(reservationId);
    expect(stored?.status).toBe("confirmed");
  });

  it("returns minimal public reservation details", async () => {
    const { slug } = await enableBookingPage();
    const created = await service.createReservation(slug, {
      slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      notes: "secret notes",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });

    const publicReservation = await service.getPublicReservation(
      new ObjectId(created.reservationId),
    );

    expect(publicReservation).toEqual({
      slotStart: created.slotStart,
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
      hostDisplayName: "Host User",
      status: "confirmed",
      bookingSlug: slug,
      guestName: "Ada Lovelace",
      notes: "secret notes",
      createsGoogleMeet: true,
      conference: "meet",
    });
    expect(publicReservation).not.toHaveProperty("guestEmail");
    expect(publicReservation).not.toHaveProperty("cancelUrl");
    expect(publicReservation).not.toHaveProperty("rescheduleUrl");
  });

  it("returns the booked slot duration after the host changes page duration", async () => {
    const { slug, userId, calendarId } = await enableBookingPage();
    const created = await service.createReservation(slug, {
      slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      notes: "secret notes",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });

    spyOn(billingGuard, "assertBillingAllowsWrites").mockResolvedValue(
      undefined,
    );
    await bookingPageService.putAdminPage(
      userId,
      samplePutInput({
        destinationCalendarId: calendarId,
        blockingCalendarIds: [calendarId],
        durationMinutes: 45,
      }),
    );

    const publicReservation = await service.getPublicReservation(
      new ObjectId(created.reservationId),
    );
    expect(publicReservation.durationMinutes).toBe(30);
  });

  it("returns cancelled status without leaking guest contact", async () => {
    const { slug } = await enableBookingPage();
    const created = await service.createReservation(slug, {
      slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });
    const token = new URL(created.cancelUrl).searchParams.get("token");
    await service.cancelReservation(new ObjectId(created.reservationId), {
      token,
    });

    const publicReservation = await service.getPublicReservation(
      new ObjectId(created.reservationId),
    );
    expect(publicReservation.status).toBe("cancelled");
    expect(publicReservation).not.toHaveProperty("guestEmail");
  });

  it("throws not found for an unknown reservation", async () => {
    await expect(
      service.getPublicReservation(new ObjectId()),
    ).rejects.toMatchObject({ bookingCode: "RESERVATION_NOT_FOUND" });
  });

  it("still returns slots when the page already has a confirmed reservation", async () => {
    const { slug } = await enableBookingPage();
    const booked = `${BOOKING_MONDAY}T10:00:00.000Z`;
    await service.createReservation(slug, {
      slotStart: booked,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });

    const response = await service.getSlots(slug, {
      start: `${BOOKING_MONDAY}T00:00:00.000Z`,
      end: `${BOOKING_TUESDAY}T00:00:00.000Z`,
      timeZone: "UTC",
    });

    expect(response.bookable).toBe(true);
    expect(response.slots.length).toBeGreaterThan(0);
    expect(response.slots.map((slot) => slot.slotStart)).not.toContain(booked);
  });

  it("returns the same slot set for two different guest timeZone values", async () => {
    const { slug } = await enableBookingPage();
    const window = {
      start: `${BOOKING_MONDAY}T00:00:00.000Z`,
      end: `${BOOKING_TUESDAY}T00:00:00.000Z`,
    };

    const utc = await service.getSlots(slug, {
      ...window,
      timeZone: "UTC",
    });
    const tokyo = await service.getSlots(slug, {
      ...window,
      timeZone: "Asia/Tokyo",
    });

    expect(utc.bookable).toBe(true);
    expect(utc.slots.length).toBeGreaterThan(0);
    expect(tokyo).toEqual(utc);
  });

  it("does not fetch a confirmed reservation far outside the requested window", async () => {
    const { slug, pageId } = await enableBookingPage();
    await seedConfirmedReservation(
      pageId,
      "2025-09-08T10:00:00.000Z",
      "2025-09-08T10:30:00.000Z",
    );
    const listSpy = spyOn(
      bookingReservationRepository,
      "listConfirmedStartsByPageId",
    );

    try {
      const response = await service.getSlots(slug, {
        start: `${BOOKING_MONDAY}T00:00:00.000Z`,
        end: `${BOOKING_TUESDAY}T00:00:00.000Z`,
        timeZone: "UTC",
      });

      const fetched = (await listSpy.mock.results[0]?.value) as Date[];
      expect(fetched.map((start) => start.toISOString())).not.toContain(
        "2025-09-08T10:00:00.000Z",
      );
      expect(response.bookable).toBe(true);
      expect(response.slots.map((slot) => slot.slotStart)).toContain(
        `${BOOKING_MONDAY}T10:00:00Z`,
      );
    } finally {
      listSpy.mockRestore();
    }
  });

  it("offers the slot adjacent to a confirmed reservation", async () => {
    const { slug, pageId } = await enableBookingPage("Adjacent Host");
    await seedConfirmedReservation(
      pageId,
      `${BOOKING_MONDAY}T09:00:00.000Z`,
      `${BOOKING_MONDAY}T09:30:00.000Z`,
    );

    const response = await service.getSlots(slug, {
      start: `${BOOKING_MONDAY}T09:30:00.000Z`,
      end: `${BOOKING_MONDAY}T11:00:00.000Z`,
      timeZone: "UTC",
    });

    expect(response.slots.map((slot) => slot.slotStart)).toContain(
      `${BOOKING_MONDAY}T09:30:00Z`,
    );
  });

  it("accepts a reservation directly adjacent to an existing one", async () => {
    const { slug, pageId } = await enableBookingPage("Touching Host");
    await seedConfirmedReservation(
      pageId,
      `${BOOKING_MONDAY}T09:00:00.000Z`,
      `${BOOKING_MONDAY}T09:30:00.000Z`,
    );

    const created = await service.createReservation(slug, {
      slotStart: `${BOOKING_MONDAY}T09:30:00.000Z`,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });

    expect(created.slotStart).toBe(`${BOOKING_MONDAY}T09:30:00.000Z`);
    expect(createBookingEvent).toHaveBeenCalledTimes(1);
  });

  it("accepts a second non-overlapping booking on the same page", async () => {
    const { slug } = await enableBookingPage();
    await service.createReservation(slug, {
      slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });

    const second = await service.createReservation(slug, {
      slotStart: `${BOOKING_MONDAY}T11:00:00.000Z`,
      guestName: "Grace Hopper",
      guestEmail: "grace@example.com",
      guestTimeZone: "America/New_York",
      durationMinutes: 30,
    });

    expect(second.reservationId).toBeTruthy();
    expect(createBookingEvent).toHaveBeenCalledTimes(2);
  });

  it("rejects a concurrent overlapping confirm and compensates the event", async () => {
    const { slug, pageId } = await enableBookingPage();
    // Simulate the race: a rival confirms an overlapping adjacent-grid slot
    // after our engine pre-check but before our insert (during the slow
    // calendar call). The unique index cannot catch this (different starts).
    createBookingEvent.mockImplementation(async () => {
      await seedConfirmedReservation(
        pageId,
        `${BOOKING_MONDAY}T10:15:00.000Z`,
        `${BOOKING_MONDAY}T10:45:00.000Z`,
      );
      return "our-evt";
    });

    await expect(
      service.createReservation(slug, {
        slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
        guestName: "Ada Lovelace",
        guestEmail: "ada@example.com",
        guestTimeZone: "Europe/London",
        durationMinutes: 30,
      }),
    ).rejects.toMatchObject({ bookingCode: "SLOT_UNAVAILABLE" });

    expect(deleteBookingEvent).toHaveBeenCalledTimes(1);
    expect(
      (deleteBookingEvent.mock.calls as unknown[][])[0]?.[1],
    ).toMatchObject({
      eventId: "our-evt",
    });
    const survivors =
      await bookingReservationRepository.listConfirmedOverlapping(
        pageId,
        new Date(`${BOOKING_MONDAY}T09:00:00.000Z`),
        new Date(`${BOOKING_MONDAY}T12:00:00.000Z`),
      );
    expect(survivors).toHaveLength(1);
  });

  it("logs a failed race compensation without changing SLOT_UNAVAILABLE", async () => {
    const { slug, pageId, userId, calendarId } = await enableBookingPage();
    createBookingEvent.mockImplementation(async () => {
      await seedConfirmedReservation(
        pageId,
        `${BOOKING_MONDAY}T10:15:00.000Z`,
        `${BOOKING_MONDAY}T10:45:00.000Z`,
      );
      return "our-evt";
    });
    deleteBookingEvent.mockImplementation(async () => {
      throw new BaseError(
        "SYNC_UNAVAILABLE",
        "could not delete the orphaned event",
        Status.SERVICE_UNAVAILABLE,
        true,
      );
    });
    const logSpy = spyOn(publicBookingCompensationLog, "failed");

    try {
      await expect(
        service.createReservation(slug, {
          slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
          guestName: "Ada Lovelace",
          guestEmail: "ada@example.com",
          guestTimeZone: "Europe/London",
          durationMinutes: 30,
        }),
      ).rejects.toMatchObject({ bookingCode: "SLOT_UNAVAILABLE" });

      expect(logSpy).toHaveBeenCalledTimes(1);
      expect((logSpy.mock.calls as unknown[][])[0]?.[0]).toMatchObject({
        result: "SYNC_UNAVAILABLE",
      });
      expect((logSpy.mock.calls as unknown[][])[0]?.[1]).toMatchObject({
        tenantId: userId.toString(),
        principalId: userId.toString(),
        calendarId,
        eventId: "our-evt",
        slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
      });
      const survivors =
        await bookingReservationRepository.listConfirmedOverlapping(
          pageId,
          new Date(`${BOOKING_MONDAY}T09:00:00.000Z`),
          new Date(`${BOOKING_MONDAY}T12:00:00.000Z`),
        );
      expect(survivors).toHaveLength(1);
    } finally {
      logSpy.mockRestore();
    }
  });

  it("translates a same-start duplicate insert into SLOT_UNAVAILABLE", async () => {
    const { slug, pageId } = await enableBookingPage();
    createBookingEvent.mockImplementation(async () => {
      await seedConfirmedReservation(
        pageId,
        `${BOOKING_MONDAY}T10:00:00.000Z`,
        `${BOOKING_MONDAY}T10:30:00.000Z`,
      );
      return "our-evt";
    });

    await expect(
      service.createReservation(slug, {
        slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
        guestName: "Ada Lovelace",
        guestEmail: "ada@example.com",
        guestTimeZone: "Europe/London",
        durationMinutes: 30,
      }),
    ).rejects.toMatchObject({ bookingCode: "SLOT_UNAVAILABLE" });

    expect(deleteBookingEvent).toHaveBeenCalledTimes(1);
  });

  it("includes cancel and reschedule URLs in the event description", async () => {
    const { slug } = await enableBookingPage();

    const created = await service.createReservation(slug, {
      slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      notes: "bring coffee",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });

    const eventInput = (
      createBookingEvent.mock.calls as unknown[][]
    )[0]?.[1] as {
      description: string;
    };
    expect(eventInput.description).toBe(
      `bring coffee\n\nCancel: ${created.cancelUrl}\n\nReschedule: ${created.rescheduleUrl}`,
    );
  });

  it("asks Sync to mint Meet on confirm and does not invent a conference URL", async () => {
    const { slug } = await enableBookingPage();
    const submitCommand = mock(async () => ({
      ok: true as const,
      value: { commandId: new ObjectId().toString() },
    }));
    spyOn(calendarService, "getLocalCalendar").mockResolvedValue(null);
    const bookingService = new PublicBookingService(
      new CalendarBookingService({
        queryBusyAvailability: mock(async () => ({
          ok: true as const,
          value: busyResponse(true),
        })),
        submitCommand,
      } as unknown as SyncServiceClient),
    );

    await bookingService.createReservation(slug, {
      slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });

    expect(submitCommand).toHaveBeenCalledTimes(1);
    const input = createInputFrom(submitCommand);
    expect(input.createConference).toBe(true);
    expect(input.content.conference).toBeNull();
  });

  it("patches guest name and notes and submits an event update", async () => {
    const { slug } = await enableBookingPage();
    const created = await service.createReservation(slug, {
      slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      notes: "bring coffee",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });
    const token = new URL(created.cancelUrl).searchParams.get("token");
    const reservationId = new ObjectId(created.reservationId);

    const patched = await service.patchPublicReservation(reservationId, {
      token,
      name: "Grace Hopper",
      notes: "bring tea",
    });

    expect(patched.guestName).toBe("Grace Hopper");
    expect(patched.notes).toBe("bring tea");
    expect(updateBookingEvent).toHaveBeenCalledTimes(1);
    expect(
      (updateBookingEvent.mock.calls as unknown[][])[0]?.[1],
    ).toMatchObject({
      title: "Grace Hopper and Host User",
    });
    const description = (
      (updateBookingEvent.mock.calls as unknown[][])[0]?.[1] as {
        description: string;
      }
    ).description;
    expect(description).toMatch(/^bring tea\n\nCancel: .+\n\nReschedule: .+$/);
    const stored = await bookingReservationRepository.findById(reservationId);
    expect(stored?.guestName).toBe("Grace Hopper");
    expect(stored?.notes).toBe("bring tea");
    expect(stored?.guestEmail).toBe("ada@example.com");
  });

  it("rejects a wrong patch token without changing the row", async () => {
    const { slug } = await enableBookingPage();
    const created = await service.createReservation(slug, {
      slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      notes: "bring coffee",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });
    const reservationId = new ObjectId(created.reservationId);

    await expect(
      service.patchPublicReservation(reservationId, {
        token: "not-the-token",
        name: "Grace Hopper",
      }),
    ).rejects.toMatchObject({ bookingCode: "RESERVATION_NOT_FOUND" });

    expect(updateBookingEvent).not.toHaveBeenCalled();
    const stored = await bookingReservationRepository.findById(reservationId);
    expect(stored?.guestName).toBe("Ada Lovelace");
    expect(stored?.notes).toBe("bring coffee");
  });

  it("rejects patching a cancelled reservation without a command", async () => {
    const { slug } = await enableBookingPage();
    const created = await service.createReservation(slug, {
      slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      notes: "bring coffee",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });
    const token = new URL(created.cancelUrl).searchParams.get("token");
    const reservationId = new ObjectId(created.reservationId);
    await service.cancelReservation(reservationId, { token });
    updateBookingEvent.mockClear();

    await expect(
      service.patchPublicReservation(reservationId, {
        token,
        name: "Grace Hopper",
      }),
    ).rejects.toMatchObject({ bookingCode: "RESERVATION_NOT_FOUND" });

    expect(updateBookingEvent).not.toHaveBeenCalled();
    const stored = await bookingReservationRepository.findById(reservationId);
    expect(stored?.guestName).toBe("Ada Lovelace");
    expect(stored?.status).toBe("cancelled");
  });

  it("rejects an expired patch token at slotEnd with RESERVATION_NOT_FOUND", async () => {
    const { pageId } = await enableBookingPage();
    const token = generateCancelToken();
    const reservationId = new ObjectId();
    await bookingReservationRepository.insert({
      _id: reservationId,
      pageId,
      slotStart: new Date("2025-09-07T10:00:00.000Z"),
      slotEnd: new Date("2025-09-07T10:30:00.000Z"),
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      notes: "bring coffee",
      guestTimeZone: "UTC",
      status: "confirmed",
      calendarEventId: "past-evt",
      cancelTokenHash: hashCancelToken(token),
    });

    await expect(
      service.patchPublicReservation(reservationId, {
        token,
        name: "Grace Hopper",
      }),
    ).rejects.toMatchObject({ bookingCode: "RESERVATION_NOT_FOUND" });
    expect(updateBookingEvent).not.toHaveBeenCalled();
    const stored = await bookingReservationRepository.findById(reservationId);
    expect(stored?.guestName).toBe("Ada Lovelace");
  });

  it("rejects invalid guest email", async () => {
    const { slug } = await enableBookingPage();
    await expect(
      service.createReservation(slug, {
        slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
        guestName: "Ada Lovelace",
        guestEmail: "not-an-email",
        guestTimeZone: "Europe/London",
        durationMinutes: 30,
      }),
    ).rejects.toMatchObject({ bookingCode: "INVALID_INPUT" });
  });

  it("reschedules a confirmed reservation to a new slot", async () => {
    const { slug } = await enableBookingPage();
    const created = await service.createReservation(slug, {
      slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });
    const token = new URL(created.cancelUrl).searchParams.get("token");
    const reservationId = new ObjectId(created.reservationId);
    createBookingEvent.mockClear();
    updateBookingEvent.mockClear();

    const response = await service.rescheduleReservation(reservationId, {
      token,
      slotStart: `${BOOKING_MONDAY}T11:00:00.000Z`,
      guestTimeZone: "America/Denver",
      durationMinutes: 30,
    });

    expect(updateBookingEvent).toHaveBeenCalledTimes(1);
    expect(
      (updateBookingEvent.mock.calls as unknown[][])[0]?.[1],
    ).toMatchObject({
      start: `${BOOKING_MONDAY}T11:00:00.000Z`,
      end: `${BOOKING_MONDAY}T11:30:00.000Z`,
    });
    expect(createBookingEvent).not.toHaveBeenCalled();
    expect(response.slotStart).toBe(`${BOOKING_MONDAY}T11:00:00.000Z`);
    expect(response.slotEnd).toBe(`${BOOKING_MONDAY}T11:30:00.000Z`);
    expect(response.guestTimeZone).toBe("America/Denver");
    expect(response.status).toBe("confirmed");
    expect(response).not.toHaveProperty("guestEmail");
    expect(response).not.toHaveProperty("cancelUrl");
    const stored = await bookingReservationRepository.findById(reservationId);
    expect(stored?.slotStart.toISOString()).toBe(
      `${BOOKING_MONDAY}T11:00:00.000Z`,
    );
    expect(stored?.calendarEventId).toBeTruthy();
  });

  it("rejects reschedule when pinned duration does not match the page", async () => {
    const { slug, userId, calendarId } = await enableBookingPage();
    const created = await service.createReservation(slug, {
      slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });
    const token = new URL(created.cancelUrl).searchParams.get("token");
    const reservationId = new ObjectId(created.reservationId);
    spyOn(billingGuard, "assertBillingAllowsWrites").mockResolvedValue(
      undefined,
    );
    await bookingPageService.putAdminPage(
      userId,
      samplePutInput({
        destinationCalendarId: calendarId,
        blockingCalendarIds: [calendarId],
        durationMinutes: 45,
      }),
    );
    createBookingEvent.mockClear();
    updateBookingEvent.mockClear();

    await expect(
      service.rescheduleReservation(reservationId, {
        token,
        slotStart: `${BOOKING_MONDAY}T11:00:00.000Z`,
        guestTimeZone: "Europe/London",
        durationMinutes: 30,
      }),
    ).rejects.toMatchObject({
      bookingCode: "SLOT_UNAVAILABLE",
      statusCode: Status.CONFLICT,
    });
    expect(updateBookingEvent).not.toHaveBeenCalled();
    expect(createBookingEvent).not.toHaveBeenCalled();
  });

  it("treats a second reschedule to the same slot as idempotent", async () => {
    const { slug } = await enableBookingPage();
    const created = await service.createReservation(slug, {
      slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });
    const token = new URL(created.cancelUrl).searchParams.get("token");
    const reservationId = new ObjectId(created.reservationId);
    await service.rescheduleReservation(reservationId, {
      token,
      slotStart: `${BOOKING_MONDAY}T11:00:00.000Z`,
      guestTimeZone: "America/Denver",
      durationMinutes: 30,
    });
    updateBookingEvent.mockClear();

    const again = await service.rescheduleReservation(reservationId, {
      token,
      slotStart: `${BOOKING_MONDAY}T11:00:00.000Z`,
      guestTimeZone: "UTC",
      durationMinutes: 30,
    });

    expect(updateBookingEvent).not.toHaveBeenCalled();
    expect(again.slotStart).toBe(`${BOOKING_MONDAY}T11:00:00.000Z`);
    expect(again.guestTimeZone).toBe("America/Denver");
  });

  it("rejects reschedule onto another confirmed reservation", async () => {
    const { slug, pageId } = await enableBookingPage();
    const created = await service.createReservation(slug, {
      slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });
    await seedConfirmedReservation(
      pageId,
      `${BOOKING_MONDAY}T11:00:00.000Z`,
      `${BOOKING_MONDAY}T11:30:00.000Z`,
    );
    const token = new URL(created.cancelUrl).searchParams.get("token");
    const reservationId = new ObjectId(created.reservationId);
    updateBookingEvent.mockClear();

    await expect(
      service.rescheduleReservation(reservationId, {
        token,
        slotStart: `${BOOKING_MONDAY}T11:00:00.000Z`,
        guestTimeZone: "Europe/London",
        durationMinutes: 30,
      }),
    ).rejects.toMatchObject({ bookingCode: "SLOT_UNAVAILABLE" });
    expect(updateBookingEvent).not.toHaveBeenCalled();
  });

  it("rejects reschedule of a cancelled reservation", async () => {
    const { slug } = await enableBookingPage();
    const created = await service.createReservation(slug, {
      slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });
    const token = new URL(created.cancelUrl).searchParams.get("token");
    const reservationId = new ObjectId(created.reservationId);
    await service.cancelReservation(reservationId, { token });
    updateBookingEvent.mockClear();

    await expect(
      service.rescheduleReservation(reservationId, {
        token,
        slotStart: `${BOOKING_MONDAY}T11:00:00.000Z`,
        guestTimeZone: "Europe/London",
        durationMinutes: 30,
      }),
    ).rejects.toMatchObject({ bookingCode: "RESERVATION_NOT_FOUND" });
    expect(updateBookingEvent).not.toHaveBeenCalled();
  });

  it("rejects a bad or missing reschedule token as not-found", async () => {
    const { slug } = await enableBookingPage();
    const created = await service.createReservation(slug, {
      slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });
    const reservationId = new ObjectId(created.reservationId);
    updateBookingEvent.mockClear();

    await expect(
      service.rescheduleReservation(reservationId, {
        token: "not-the-token",
        slotStart: `${BOOKING_MONDAY}T11:00:00.000Z`,
        guestTimeZone: "Europe/London",
        durationMinutes: 30,
      }),
    ).rejects.toMatchObject({ bookingCode: "RESERVATION_NOT_FOUND" });
    await expect(
      service.rescheduleReservation(reservationId, {
        slotStart: `${BOOKING_MONDAY}T11:00:00.000Z`,
        guestTimeZone: "Europe/London",
        durationMinutes: 30,
      }),
    ).rejects.toMatchObject({ bookingCode: "RESERVATION_NOT_FOUND" });
    await expect(
      service.rescheduleReservation(new ObjectId(), {
        token: "a".repeat(32),
        slotStart: `${BOOKING_MONDAY}T11:00:00.000Z`,
        guestTimeZone: "Europe/London",
        durationMinutes: 30,
      }),
    ).rejects.toMatchObject({ bookingCode: "RESERVATION_NOT_FOUND" });
    expect(updateBookingEvent).not.toHaveBeenCalled();
  });

  it("includes the current start on tokenized slots and hides it on public slots", async () => {
    const { slug } = await enableBookingPage();
    const created = await service.createReservation(slug, {
      slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });
    const token = new URL(created.cancelUrl).searchParams.get("token");
    const reservationId = new ObjectId(created.reservationId);
    const window = {
      start: `${BOOKING_MONDAY}T00:00:00.000Z`,
      end: `${BOOKING_TUESDAY}T00:00:00.000Z`,
      timeZone: "UTC",
    };

    const publicSlots = await service.getSlots(slug, window);
    const tokenized = await service.getReservationSlots(reservationId, {
      ...window,
      token,
    });

    const booked = Date.parse(`${BOOKING_MONDAY}T10:00:00.000Z`);
    expect(
      publicSlots.slots.map((slot) => Date.parse(slot.slotStart)),
    ).not.toContain(booked);
    expect(tokenized.slots.map((slot) => Date.parse(slot.slotStart))).toContain(
      booked,
    );
    const createdEventId = await createBookingEvent.mock.results[0]?.value;
    expect(
      (getAvailability.mock.calls as unknown[][]).at(-1)?.[1],
    ).toMatchObject({
      excludeEventIds: [createdEventId],
    });
  });

  it("keeps overlapping host busy after self-exclusion", async () => {
    const { slug } = await enableBookingPage();
    const created = await service.createReservation(slug, {
      slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
    });
    const token = new URL(created.cancelUrl).searchParams.get("token");
    getAvailability.mockImplementation(async () => ({
      ...busyResponse(true),
      intervals: [
        {
          start: `${BOOKING_MONDAY}T10:00:00.000Z`,
          end: `${BOOKING_MONDAY}T11:00:00.000Z`,
          hostIsOrganizer: true,
        },
      ],
    }));

    const tokenized = await service.getReservationSlots(
      new ObjectId(created.reservationId),
      {
        token,
        start: `${BOOKING_MONDAY}T00:00:00.000Z`,
        end: `${BOOKING_TUESDAY}T00:00:00.000Z`,
        timeZone: "UTC",
      },
    );

    const occupied = Date.parse(`${BOOKING_MONDAY}T10:00:00.000Z`);
    const halfHour = Date.parse(`${BOOKING_MONDAY}T10:30:00.000Z`);
    const starts = tokenized.slots.map((slot) => Date.parse(slot.slotStart));
    expect(starts).not.toContain(occupied);
    expect(starts).not.toContain(halfHour);
  });
});

describe("Public booking routes", () => {
  const baseDriver = new BaseDriver();
  let syncSpies: Array<{ mockRestore: () => void }> = [];

  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await ensureBookingIndexes();
    await baseDriver.listen();
  });

  beforeEach(async () => {
    await cleanupCollections();
    syncSpies.forEach((spy) => spy.mockRestore());
    syncSpies = [];
  });

  afterAll(async () => {
    await baseDriver.teardown();
    await cleanupTestDb();
  });

  const mockHealthySync = (
    calendars: ReturnType<typeof writableCalendar>[],
    availability = busyResponse(true),
    connection: TestSyncConnection = healthyConnection(),
  ) => {
    const wired = calendars.map((calendar) => ({
      ...calendar,
      connectionId: connection.id,
    }));
    syncSpies.push(
      spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
        listConnections: mock(() =>
          Promise.resolve({
            ok: true as const,
            value: { connections: [connection] },
          }),
        ),
        listCalendars: mock(() =>
          Promise.resolve({
            ok: true as const,
            value: { calendars: wired },
          }),
        ),
        queryBusyAvailability: mock(async () => ({
          ok: true as const,
          value: availability,
        })),
        submitCommand: mock(async () => ({
          ok: true as const,
          value: { commandId: new ObjectId().toString() },
        })),
      } as never),
    );
    return { connection, calendars: wired };
  };

  it("GET public page returns host info for enabled slug", async () => {
    const userId = await createNamedUser("Public Host");
    const calendar = writableCalendar();
    mockHealthySync([calendar]);
    spyOn(billingGuard, "assertBillingAllowsWrites").mockResolvedValue(
      undefined,
    );
    const page = await bookingPageService.putAdminPage(
      userId,
      samplePutInput({
        destinationCalendarId: calendar.id,
        blockingCalendarIds: [calendar.id],
      }),
    );
    const slug = "slug" in page ? page.slug : "";

    const response = await baseDriver
      .getServer()
      .get(`/api/booking/pages/${slug}`)
      .expect(Status.OK);

    expect(response.body).toEqual(
      expect.objectContaining({
        hostDisplayName: "Public Host",
        durationMinutes: 30,
        enabled: true,
        maxHorizonDays: 60,
        createsGoogleMeet: true,
      }),
    );
  });

  it("GET public page returns 404 for missing slug", async () => {
    await baseDriver
      .getServer()
      .get("/api/booking/pages/notfound999")
      .expect(Status.NOT_FOUND);
  });

  it("GET public reservation returns 404 for an invalid id", async () => {
    await baseDriver
      .getServer()
      .get("/api/booking/reservations/not-an-id")
      .expect(Status.NOT_FOUND);
  });

  it("GET public reservation returns minimal fields", async () => {
    const userId = await createNamedUser("Permalink Host");
    const calendar = writableCalendar();
    mockHealthySync([calendar]);
    spyOn(billingGuard, "assertBillingAllowsWrites").mockResolvedValue(
      undefined,
    );
    const page = await bookingPageService.putAdminPage(
      userId,
      samplePutInput({
        destinationCalendarId: calendar.id,
        blockingCalendarIds: [calendar.id],
      }),
    );
    if (!("id" in page) || !("slug" in page)) {
      throw new Error("expected a saved booking page");
    }
    const reservationId = new ObjectId();
    await bookingReservationRepository.insert({
      _id: reservationId,
      pageId: new ObjectId(page.id),
      slotStart: new Date(`${BOOKING_MONDAY}T10:00:00.000Z`),
      slotEnd: new Date(`${BOOKING_MONDAY}T10:30:00.000Z`),
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      notes: "secret notes",
      guestTimeZone: "Europe/London",
      status: "confirmed",
      calendarEventId: "evt-1",
      cancelTokenHash: "a".repeat(64),
    });

    const response = await baseDriver
      .getServer()
      .get(`/api/booking/reservations/${reservationId.toString()}`)
      .expect(Status.OK);

    expect(response.body).toEqual({
      slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
      hostDisplayName: "Permalink Host",
      status: "confirmed",
      bookingSlug: page.slug,
      guestName: "Ada Lovelace",
      notes: "secret notes",
      createsGoogleMeet: true,
      conference: "meet",
    });
    expect(response.body).not.toHaveProperty("guestEmail");
    expect(response.body).not.toHaveProperty("cancelUrl");
    expect(response.body).not.toHaveProperty("rescheduleUrl");
  });

  it("POST reservation returns 409 when bookable is false", async () => {
    const userId = await createNamedUser("Unavailable Host");
    const calendar = writableCalendar();
    mockHealthySync([calendar], busyResponse(false));
    spyOn(billingGuard, "assertBillingAllowsWrites").mockResolvedValue(
      undefined,
    );
    const page = await bookingPageService.putAdminPage(
      userId,
      samplePutInput({
        destinationCalendarId: calendar.id,
        blockingCalendarIds: [calendar.id],
      }),
    );
    const slug = "slug" in page ? page.slug : "";

    await baseDriver
      .getServer()
      .post(`/api/booking/pages/${slug}/reservations`)
      .send({
        slotStart: `${BOOKING_MONDAY}T10:00:00.000Z`,
        guestName: "Ada Lovelace",
        guestEmail: "ada@example.com",
        guestTimeZone: "Europe/London",
        durationMinutes: 30,
      })
      .expect(Status.CONFLICT);
  });
});

describe("booking cancel token", () => {
  it("hashes and verifies with constant-time compare", async () => {
    const { generateCancelToken, hashCancelToken, verifyCancelToken } =
      await import("@backend/booking/booking-cancel-token");
    const token = generateCancelToken();
    const hash = hashCancelToken(token);
    expect(verifyCancelToken(hash, token)).toBe(true);
    expect(verifyCancelToken(hash, `${token}x`)).toBe(false);
    expect(hash).toHaveLength(64);
    expect(
      timingSafeEqual(
        Buffer.from(hash),
        Buffer.from(createHash("sha256").update(token, "utf8").digest("hex")),
      ),
    ).toBe(true);
    expect(randomBytes(32).length).toBe(32);
  });
});
