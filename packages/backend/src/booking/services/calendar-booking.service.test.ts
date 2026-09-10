import { faker } from "@faker-js/faker";
import { type CommandSubmitRequest } from "@core/types/sync/command.contracts";
import { BOOKING_CONFIRMATION_MAX_AGE_MS } from "@backend/booking/services/calendar-booking.port";
import { CalendarBookingService } from "@backend/booking/services/calendar-booking.service";
import calendarService from "@backend/calendar/services/calendar.service";
import { type SyncServiceClient } from "@backend/common/services/sync-service/sync-service.client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

const userId = () => faker.database.mongodbObjectId();
const calendarId = () => faker.database.mongodbObjectId();

const submitRequestFrom = (submitCommand: {
  mock: { calls: unknown[][] };
}): CommandSubmitRequest => {
  const request = submitCommand.mock.calls[0]?.[1];
  if (!request) {
    throw new Error("Expected submitCommand to have been called");
  }
  return request as CommandSubmitRequest;
};

const busyResponse = {
  intervals: [],
  computedAt: "2026-09-01T12:00:00.000Z",
  connections: [],
  complete: true,
  issues: [],
  bookable: true,
};

describe("CalendarBookingService", () => {
  beforeEach(() => {
    spyOn(calendarService, "getLocalCalendar").mockResolvedValue(null);
  });
  afterEach(() => {
    mock.restore();
  });

  it("covers Google reconcile lag so quiet calendars stay bookable", () => {
    const reconcileStaleAfterMs = 15 * 60_000;
    const reconcileSweepIntervalMs = 10 * 60_000;
    expect(BOOKING_CONFIRMATION_MAX_AGE_MS).toBeGreaterThanOrEqual(
      reconcileStaleAfterMs + reconcileSweepIntervalMs,
    );
  });

  it("queries busy availability with booking_confirmation purpose and reconcile-sized maxAge", async () => {
    const queryBusyAvailability = mock(async () => ({
      ok: true as const,
      value: busyResponse,
    }));
    const service = new CalendarBookingService({
      queryBusyAvailability,
      submitCommand: mock(async () => ({ ok: true as const, value: {} })),
    } as unknown as SyncServiceClient);

    const result = await service.getAvailability(userId(), {
      calendarIds: [calendarId()],
      start: "2026-09-01T12:00:00.000Z",
      end: "2026-09-02T12:00:00.000Z",
    });

    expect(result.bookable).toBe(true);
    expect(queryBusyAvailability).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        purpose: "booking_confirmation",
        maxAgeMs: BOOKING_CONFIRMATION_MAX_AGE_MS,
      }),
    );
  });

  it("allowlists the Compass-local calendar as unbacked busy", async () => {
    mock.restore();
    const localId = calendarId();
    spyOn(calendarService, "getLocalCalendar").mockResolvedValue({
      _id: { toHexString: () => localId },
    } as never);
    const queryBusyAvailability = mock(async () => ({
      ok: true as const,
      value: busyResponse,
    }));
    const service = new CalendarBookingService({
      queryBusyAvailability,
      submitCommand: mock(async () => ({ ok: true as const, value: {} })),
    } as unknown as SyncServiceClient);

    await service.getAvailability(userId(), {
      calendarIds: [localId, calendarId()],
      start: "2026-09-01T12:00:00.000Z",
      end: "2026-09-02T12:00:00.000Z",
    });

    expect(queryBusyAvailability).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        unbackedCalendarIds: [localId],
      }),
    );
    expect(
      (queryBusyAvailability.mock.calls as unknown[][])[0]?.[1],
    ).not.toHaveProperty("excludeEventIds");
  });

  it("forwards excludeEventIds on the busy query when provided", async () => {
    const queryBusyAvailability = mock(async () => ({
      ok: true as const,
      value: busyResponse,
    }));
    const service = new CalendarBookingService({
      queryBusyAvailability,
      submitCommand: mock(async () => ({ ok: true as const, value: {} })),
    } as unknown as SyncServiceClient);
    const excluded = [faker.database.mongodbObjectId()];

    await service.getAvailability(userId(), {
      calendarIds: [calendarId()],
      start: "2026-09-01T12:00:00.000Z",
      end: "2026-09-02T12:00:00.000Z",
      excludeEventIds: excluded,
    });

    expect(queryBusyAvailability).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        excludeEventIds: excluded,
        purpose: "booking_confirmation",
      }),
    );
  });

  it("returns bookable false without throwing", async () => {
    const service = new CalendarBookingService({
      queryBusyAvailability: mock(async () => ({
        ok: true as const,
        value: { ...busyResponse, bookable: false },
      })),
      submitCommand: mock(async () => ({ ok: true as const, value: {} })),
    } as unknown as SyncServiceClient);

    const result = await service.getAvailability(userId(), {
      calendarIds: [calendarId()],
      start: "2026-09-01T12:00:00.000Z",
      end: "2026-09-02T12:00:00.000Z",
    });

    expect(result.bookable).toBe(false);
  });

  it("submits a booking create with conference and guest attendee", async () => {
    const submitCommand = mock(async () => ({
      ok: true as const,
      value: { commandId: faker.database.mongodbObjectId() },
    }));
    const service = new CalendarBookingService({
      queryBusyAvailability: mock(async () => ({
        ok: true as const,
        value: busyResponse,
      })),
      submitCommand,
    } as unknown as SyncServiceClient);

    const description =
      "Cancel: https://compasscalendar.com/cancel/x\n\nReschedule: https://compasscalendar.com/reschedule/x";

    await service.createBookingEvent(userId(), {
      calendarId: calendarId(),
      title: "Ada and Tyler",
      description,
      start: "2026-09-01T15:00:00.000Z",
      end: "2026-09-01T15:30:00.000Z",
      timeZone: "America/Denver",
      guest: { email: "ada@example.com", displayName: "Ada Lovelace" },
      createConference: true,
    });

    expect(submitCommand).toHaveBeenCalledTimes(1);
    const request = submitRequestFrom(submitCommand);
    expect(request.input.content.description).toBe(description);
    expect(request.input).toMatchObject({
      kind: "create",
      invitation: "all",
      attendeesEdit: "replace",
      createConference: true,
      guestsCanInviteOthers: false,
    });
    expect(request.input.content.attendees).toEqual([
      {
        email: "ada@example.com",
        displayName: "Ada Lovelace",
        responseStatus: "needsAction",
      },
    ]);
    expect(request.input.content.conference).toBeNull();
  });

  it("omits createConference when the destination cannot mint a link", async () => {
    const submitCommand = mock(async () => ({
      ok: true as const,
      value: { commandId: faker.database.mongodbObjectId() },
    }));
    const service = new CalendarBookingService({
      queryBusyAvailability: mock(async () => ({
        ok: true as const,
        value: busyResponse,
      })),
      submitCommand,
    } as unknown as SyncServiceClient);

    await service.createBookingEvent(userId(), {
      calendarId: calendarId(),
      title: "Ada and Tyler",
      description: "Zoom: https://example.com/meet",
      start: "2026-09-01T15:00:00.000Z",
      end: "2026-09-01T15:30:00.000Z",
      timeZone: "America/Denver",
      guest: { email: "ada@example.com", displayName: "Ada Lovelace" },
      createConference: false,
    });

    expect(submitCommand).toHaveBeenCalledTimes(1);
    const request = submitRequestFrom(submitCommand);
    expect(request.input.createConference).toBe(false);
    expect(request.input.content.conference).toBeNull();
  });

  it("rejects empty guest email before submit", async () => {
    const submitCommand = mock(async () => ({
      ok: true as const,
      value: { commandId: faker.database.mongodbObjectId() },
    }));
    const service = new CalendarBookingService({
      queryBusyAvailability: mock(async () => ({
        ok: true as const,
        value: busyResponse,
      })),
      submitCommand,
    } as unknown as SyncServiceClient);

    await expect(
      service.createBookingEvent(userId(), {
        calendarId: calendarId(),
        title: "Ada and Tyler",
        description: "",
        start: "2026-09-01T15:00:00.000Z",
        end: "2026-09-01T15:30:00.000Z",
        timeZone: "America/Denver",
        guest: { email: "   ", displayName: null },
        createConference: true,
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(submitCommand).not.toHaveBeenCalled();
  });

  it("submits a booking update with the new title", async () => {
    const eventId = faker.database.mongodbObjectId();
    const submitCommand = mock(async () => ({
      ok: true as const,
      value: { commandId: faker.database.mongodbObjectId() },
    }));
    const service = new CalendarBookingService({
      queryBusyAvailability: mock(async () => ({
        ok: true as const,
        value: busyResponse,
      })),
      submitCommand,
    } as unknown as SyncServiceClient);

    await service.updateBookingEvent(userId(), {
      eventId,
      title: "Grace and Tyler",
      description: "bring tea",
      start: "2026-09-01T15:00:00.000Z",
      end: "2026-09-01T15:30:00.000Z",
      timeZone: "America/Denver",
      guest: { email: "ada@example.com", displayName: "Grace Hopper" },
    });

    expect(submitCommand).toHaveBeenCalledTimes(1);
    const request = submitRequestFrom(submitCommand);
    expect(request).toMatchObject({
      eventId,
      expectedVersion: null,
      input: {
        kind: "update",
        invitation: "all",
        attendeesEdit: "preserve",
        scope: "all",
        recurrenceId: null,
        content: {
          title: "Grace and Tyler",
          description: "bring tea",
          location: null,
        },
        schedule: {
          kind: "timed",
          start: "2026-09-01T15:00:00.000Z",
          end: "2026-09-01T15:30:00.000Z",
          timeZone: "America/Denver",
        },
      },
    });
    expect(request.idempotencyKey.startsWith(`update:${eventId}:`)).toBe(true);
    expect(request.idempotencyKey).toContain("2026-09-01T15:00:00.000Z");
    expect(request.input).not.toHaveProperty("createConference");
    expect(request.input.content.attendees).toEqual([]);
    expect(request.input.content.conference).toBeNull();
  });

  it("submits delete with invitation all", async () => {
    const eventId = faker.database.mongodbObjectId();
    const submitCommand = mock(async () => ({
      ok: true as const,
      value: { commandId: faker.database.mongodbObjectId() },
    }));
    const service = new CalendarBookingService({
      queryBusyAvailability: mock(async () => ({
        ok: true as const,
        value: busyResponse,
      })),
      submitCommand,
    } as unknown as SyncServiceClient);

    await service.deleteBookingEvent(userId(), { eventId });

    expect(submitCommand).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        eventId,
        input: {
          kind: "delete",
          invitation: "all",
          scope: "all",
          recurrenceId: null,
        },
      }),
    );
  });
});
