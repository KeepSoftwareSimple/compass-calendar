import { ObjectId } from "mongodb";
import { type EventId, EventIdSchema } from "@core/types/domain-primitives";
import { CommandSubmitRequestSchema } from "@core/types/sync/command.contracts";
import {
  ClientEventIdSchema,
  SyncEventCalendarIdSchema,
} from "@core/types/sync/event.contracts";
import { IdempotencyKeySchema } from "@core/types/sync/identity.contracts";
import { bookingError } from "@backend/booking/booking.error";
import {
  BOOKING_CONFIRMATION_MAX_AGE_MS,
  type CalendarBookingCreateEventInput,
  type CalendarBookingDeleteEventInput,
  type CalendarBookingGetAvailabilityInput,
  type CalendarBookingPort,
  type CalendarBookingUpdateEventInput,
} from "@backend/booking/services/calendar-booking.port";
import calendarService from "@backend/calendar/services/calendar.service";
import { submitCommandOrThrow } from "@backend/common/services/sync-service/submit-command-or-throw";
import { toSyncPrincipal } from "@backend/common/services/sync-service/sync-principal";
import { throwSyncProxyFailure } from "@backend/common/services/sync-service/sync-proxy-error";
import { type SyncServiceClient } from "@backend/common/services/sync-service/sync-service.client";
import { getSyncServiceClient } from "@backend/common/services/sync-service/sync-service.factory";
import { createHash } from "node:crypto";

const mintEventId = (): EventId =>
  EventIdSchema.parse(new ObjectId().toHexString());

const toDeleteSubmitRequest = (eventId: EventId) =>
  CommandSubmitRequestSchema.parse({
    idempotencyKey: IdempotencyKeySchema.parse(`delete:${eventId}:all`),
    eventId,
    expectedVersion: null,
    input: {
      kind: "delete",
      invitation: "all",
      scope: "all",
      recurrenceId: null,
    },
  });

const toBookingCreateSubmitRequest = (
  eventId: EventId,
  input: CalendarBookingCreateEventInput,
) =>
  CommandSubmitRequestSchema.parse({
    idempotencyKey: IdempotencyKeySchema.parse(`create:${eventId}`),
    eventId,
    expectedVersion: null,
    input: {
      kind: "create",
      calendarId: SyncEventCalendarIdSchema.parse(input.calendarId),
      clientEventId: ClientEventIdSchema.parse(eventId),
      invitation: "all",
      attendeesEdit: "replace",
      createConference: input.createConference,
      guestsCanInviteOthers: false,
      content: {
        title: input.title,
        description: input.description,
        location: null,
        organizer: null,
        attendees: [
          {
            email: input.guest.email,
            displayName: input.guest.displayName,
            responseStatus: "needsAction",
          },
        ],
        conference: null,
      },
      schedule: {
        kind: "timed",
        start: input.start,
        end: input.end,
        timeZone: input.timeZone,
      },
      recurrence: { kind: "single" },
    },
  });

const toBookingUpdateSubmitRequest = (
  input: CalendarBookingUpdateEventInput,
) => {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        title: input.title,
        description: input.description,
        displayName: input.guest.displayName,
      }),
    )
    .digest("hex")
    .slice(0, 40);
  return CommandSubmitRequestSchema.parse({
    idempotencyKey: IdempotencyKeySchema.parse(
      `update:${input.eventId}:${input.start}:${digest}`,
    ),
    eventId: input.eventId,
    expectedVersion: null,
    input: {
      kind: "update",
      invitation: "all",
      attendeesEdit: "preserve",
      content: {
        title: input.title,
        description: input.description,
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
      },
      schedule: {
        kind: "timed",
        start: input.start,
        end: input.end,
        timeZone: input.timeZone,
      },
      recurrence: { kind: "single" },
      scope: "all",
      recurrenceId: null,
    },
  });
};

export class CalendarBookingService implements CalendarBookingPort {
  constructor(
    private readonly client: SyncServiceClient = getSyncServiceClient(),
  ) {}

  async getAvailability(
    userId: string,
    input: CalendarBookingGetAvailabilityInput,
  ) {
    const localCalendar = await calendarService.getLocalCalendar(userId);
    const localId = localCalendar?._id.toHexString();
    const unbackedCalendarIds =
      localId !== undefined &&
      input.calendarIds.some((calendarId) => calendarId === localId)
        ? [SyncEventCalendarIdSchema.parse(localId)]
        : undefined;
    const result = await this.client.queryBusyAvailability(
      toSyncPrincipal(userId),
      {
        calendarIds: [...input.calendarIds],
        start: input.start,
        end: input.end,
        maxAgeMs: input.maxAgeMs ?? BOOKING_CONFIRMATION_MAX_AGE_MS,
        purpose: "booking_confirmation",
        ...(unbackedCalendarIds ? { unbackedCalendarIds } : {}),
        ...(input.excludeEventIds
          ? { excludeEventIds: [...input.excludeEventIds] }
          : {}),
      },
    );
    if (!result.ok) {
      throwSyncProxyFailure(
        result.error.kind,
        `Failed to query booking availability (${result.error.kind})`,
        result.error.detail,
      );
    }
    return result.value;
  }

  async createBookingEvent(
    userId: string,
    input: CalendarBookingCreateEventInput,
  ): Promise<EventId> {
    const guestEmail = input.guest.email.trim();
    if (!guestEmail) {
      throw bookingError("INVALID_INPUT", "Guest email is required");
    }

    const eventId = mintEventId();
    const request = toBookingCreateSubmitRequest(eventId, {
      ...input,
      guest: { ...input.guest, email: guestEmail },
    });
    await submitCommandOrThrow(this.client, userId, request);
    return eventId;
  }

  async updateBookingEvent(
    userId: string,
    input: CalendarBookingUpdateEventInput,
  ): Promise<void> {
    const guestEmail = input.guest.email.trim();
    if (!guestEmail) {
      throw bookingError("INVALID_INPUT", "Guest email is required");
    }

    await submitCommandOrThrow(
      this.client,
      userId,
      toBookingUpdateSubmitRequest({
        ...input,
        guest: { ...input.guest, email: guestEmail },
      }),
    );
  }

  async deleteBookingEvent(
    userId: string,
    input: CalendarBookingDeleteEventInput,
  ): Promise<void> {
    await submitCommandOrThrow(
      this.client,
      userId,
      toDeleteSubmitRequest(input.eventId),
    );
  }
}
