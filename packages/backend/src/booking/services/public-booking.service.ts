import { MongoServerError, type ObjectId } from "mongodb";
import {
  type ComputeBookingSlotsInput,
  computeBookingSlots,
} from "@core/booking/compute-booking-slots";
import { occupiesBookingSlot } from "@core/booking/occupies-booking-slot";
import { BaseError } from "@core/errors/errors.base";
import { Logger } from "@core/logger/winston.logger";
import {
  BookingDurationMinutesSchema,
  type BookingPageStatusResponse,
  BookingPageStatusResponseSchema,
  BookingReservationSlotsQuerySchema,
  BookingSlotsQuerySchema,
  type BookingSlotsResponse,
  BookingSlotsResponseSchema,
  CancelBookingReservationInputSchema,
  CreateBookingReservationInputSchema,
  CreateBookingReservationResponseSchema,
  isGuestEmail,
  PatchBookingReservationInputSchema,
  type PublicBookingPage,
  PublicBookingPageSchema,
  type PublicGetBookingReservationResponse,
  PublicGetBookingReservationResponseSchema,
  RescheduleBookingReservationInputSchema,
  RescheduleBookingReservationResponseSchema,
  toPublicBookingPage,
} from "@core/types/booking.contracts";
import {
  type CalendarConference,
  conferenceForDestination,
  createsGoogleMeetFromConference,
} from "@core/types/calendar.contracts";
import {
  DateTimeSchema,
  type EventId,
  EventIdSchema,
} from "@core/types/domain-primitives";
import {
  BUSY_QUERY_MAX_WINDOW_MS,
  type BusyAvailabilityResponse,
} from "@core/types/sync/availability.contracts";
import dayjs from "@core/util/date/dayjs";
import { BookingException, bookingError } from "@backend/booking/booking.error";
import {
  generateCancelToken,
  guestActionTokenAuthorizes,
  hashCancelToken,
} from "@backend/booking/booking-cancel-token";
import {
  BOOKING_OPERATION_CLAIM_LEASE_MS,
  BOOKING_OPERATION_MAX_ATTEMPTS,
  BOOKING_OPERATION_RETRY_BATCH_SIZE,
  BOOKING_OPERATION_RETRY_INTERVAL_MS,
  bookingOperationBackoffMs,
} from "@backend/booking/booking-operation.constants";
import {
  type CancelBookingOperationRecord,
  type CreateBookingOperationRecord,
  type EditBookingOperationRecord,
  type RescheduleBookingOperationRecord,
} from "@backend/booking/booking-operation.record";
import { bookingOperationRepository } from "@backend/booking/booking-operation.repository";
import { shouldYieldOverlap } from "@backend/booking/booking-overlap";
import { guestActionUrls } from "@backend/booking/booking-page.mapper";
import { type BookingPageRecord } from "@backend/booking/booking-page.record";
import { bookingPageRepository } from "@backend/booking/booking-page.repository";
import { type BookingReservationRecord } from "@backend/booking/booking-reservation.record";
import {
  bookingReservationRepository,
  confirmedReservationScanRange,
} from "@backend/booking/booking-reservation.repository";
import { reconcileBookingPageBlockingCalendars } from "@backend/booking/services/booking-blocking-calendars";
import {
  destinationReadinessReason,
  loadDestinationCatalog,
} from "@backend/booking/services/booking-destination-readiness";
import {
  emptyBookableStatus,
  hostAllowsGuestWrites,
  mapProbeToStatus,
  probeBookability,
} from "@backend/booking/services/booking-readiness";
import { type CalendarBookingPort } from "@backend/booking/services/calendar-booking.port";
import { CalendarBookingService } from "@backend/booking/services/calendar-booking.service";
import calendarService from "@backend/calendar/services/calendar.service";
import mongoService from "@backend/common/services/mongo.service";
import { toSyncPrincipal } from "@backend/common/services/sync-service/sync-principal";
import { getSyncServiceClient } from "@backend/common/services/sync-service/sync-service.factory";
import { EventMutationException } from "@backend/event/event.error";

const logger = Logger("app:booking.public");

const GUEST_PAGE_NOT_ACCEPTING_BOOKINGS =
  "This page is not accepting meetings.";

const assertHostAllowsGuestWrites = async (userId: ObjectId): Promise<void> => {
  if (!(await hostAllowsGuestWrites(userId))) {
    throw bookingError("SLOT_UNAVAILABLE", GUEST_PAGE_NOT_ACCEPTING_BOOKINGS);
  }
};

/**
 * Every guest-facing lookup failure - unknown id, wrong or expired token,
 * cancelled reservation, missing page - answers with the same 404. Minting it
 * in one place keeps the code and the message from drifting apart and
 * accidentally telling a guest which of those it was.
 */
const reservationNotFound = () =>
  bookingError("RESERVATION_NOT_FOUND", "Reservation not found");

const guestTokenFrom = (raw: unknown): string => {
  if (
    raw === null ||
    typeof raw !== "object" ||
    !("token" in raw) ||
    typeof raw.token !== "string" ||
    raw.token.trim() === ""
  ) {
    throw reservationNotFound();
  }
  return raw.token;
};

const isDuplicateSlotError = (error: unknown): boolean =>
  error instanceof MongoServerError && error.code === 11000;

const isSlotUnavailable = (error: unknown): boolean =>
  error instanceof BookingException && error.bookingCode === "SLOT_UNAVAILABLE";

const reservationConflict = () =>
  bookingError("RESERVATION_CONFLICT", "This meeting was changed. Try again.");

const asBookingProviderConflict = (error: unknown): never => {
  if (
    error instanceof EventMutationException &&
    error.mutationCode === "RECURRENCE_CONFLICT"
  ) {
    throw reservationConflict();
  }
  throw error;
};

const reservationClosedForGuestMutation = (
  reservation: BookingReservationRecord,
): boolean =>
  reservation.status === "cancelled" || reservation.status === "cancelling";

const compensationFailureCause = (error: unknown): string => {
  if (error instanceof BaseError) return error.result;
  if (error instanceof Error) return error.message;
  return String(error);
};

const truncatedOperationError = (error: unknown): string =>
  compensationFailureCause(error).slice(0, 500);

export const publicBookingCompensationLog = {
  failed(
    error: unknown,
    context: {
      tenantId: string;
      principalId: string;
      calendarId: string;
      eventId: string;
      slotStart: string;
    },
  ): void {
    logger.error(
      `Failed to compensate booking calendar event ${context.eventId}: ${compensationFailureCause(error)}`,
      context,
    );
  },
};

export const publicBookingSlotsLog = {
  unbookable(meta: {
    slug: string;
    userId: string;
    complete: boolean;
    issueReasons: string[];
    issueCalendarIds: string[];
    connectionStates: string[];
  }): void {
    logger.warn("Public booking slots unbookable", meta);
  },
};

const assertGuestEmail = (email: string): void => {
  if (!isGuestEmail(email)) {
    throw bookingError("INVALID_INPUT", "Invalid guest email");
  }
};

const resolveEnabledPage = async (
  slug: string,
): Promise<BookingPageRecord & { bookingSlug: string }> => {
  const record = await bookingPageRepository.findBySlug(slug);
  if (!record?.bookingSlug || !record.enabled) {
    throw bookingError("PAGE_NOT_FOUND", "Meeting page not found");
  }
  return { ...record, bookingSlug: record.bookingSlug };
};

const getHostDisplayName = async (userId: ObjectId): Promise<string> => {
  const user = await mongoService.user.findOne(
    { _id: userId },
    { projection: { name: 1 } },
  );
  const name = user?.name?.trim();
  if (!name) {
    throw bookingError("PAGE_NOT_FOUND", "Meeting page not found");
  }
  return name;
};

const parseSlotsQuery = (rawQuery: unknown) => {
  const query = BookingSlotsQuerySchema.parse(rawQuery);
  const startMs = Date.parse(query.start);
  const endMs = Date.parse(query.end);
  if (endMs <= startMs) {
    throw bookingError("INVALID_INPUT", "end must be after start");
  }
  if (endMs - startMs > BUSY_QUERY_MAX_WINDOW_MS) {
    throw bookingError("INVALID_INPUT", "window must not exceed 60 days");
  }
  return query;
};

const slotEndForStart = (slotStart: Date, durationMinutes: number): Date =>
  new Date(slotStart.getTime() + durationMinutes * 60_000);

const assertPinnedDuration = (
  requestedMinutes: number,
  pageDurationMinutes: number,
): void => {
  if (requestedMinutes !== pageDurationMinutes) {
    throw bookingError(
      "SLOT_UNAVAILABLE",
      "Selected slot is no longer available",
    );
  }
};

const bookingEventDescription = (
  notes: string | null | undefined,
  cancelUrl: string,
  rescheduleUrl: string,
): string =>
  [
    notes?.trim() || null,
    `Cancel: ${cancelUrl}`,
    `Reschedule: ${rescheduleUrl}`,
  ]
    .filter(Boolean)
    .join("\n\n");

const durationMinutesForReservation = (
  reservation: BookingReservationRecord,
  pageDurationMinutes: number,
) => {
  const fromSlot = Math.round(
    (reservation.slotEnd.getTime() - reservation.slotStart.getTime()) / 60_000,
  );
  return BookingDurationMinutesSchema.safeParse(fromSlot).success
    ? fromSlot
    : pageDurationMinutes;
};

/**
 * Load a reservation the guest's token actually authorizes, or 404.
 *
 * The cancel and patch entrypoints both stand on exactly this check, so it
 * lives here once: a token that no longer authorizes must never reach the
 * calendar calls below it.
 */
const loadGuestAuthorizedReservation = async (
  reservationId: ObjectId,
  token: string,
): Promise<BookingReservationRecord> => {
  const reservation =
    await bookingReservationRepository.findById(reservationId);
  if (
    !reservation ||
    !guestActionTokenAuthorizes(
      reservation.cancelTokenHash,
      token,
      reservation.slotEnd,
    )
  ) {
    throw reservationNotFound();
  }
  return reservation;
};

const resolveReservationPage = async (
  reservation: BookingReservationRecord,
): Promise<BookingPageRecord> => {
  const page = await bookingPageRepository.findById(reservation.pageId);
  if (!page) {
    throw reservationNotFound();
  }
  return page;
};

/** As above, but for the reads that have to hand the guest back a slug. */
const resolveReservationPublicPage = async (
  reservation: BookingReservationRecord,
): Promise<BookingPageRecord & { bookingSlug: string }> => {
  const page = await resolveReservationPage(reservation);
  if (!page.bookingSlug) {
    throw reservationNotFound();
  }
  return { ...page, bookingSlug: page.bookingSlug };
};

const presentReservation = async (
  reservation: BookingReservationRecord,
  page: BookingPageRecord & { bookingSlug: string },
  hostDisplayName: string,
): Promise<PublicGetBookingReservationResponse> => {
  const conference = await destinationConference(
    page.userId,
    page.destinationCalendarId,
  );
  return PublicGetBookingReservationResponseSchema.parse({
    slotStart: reservation.slotStart.toISOString(),
    guestTimeZone: reservation.guestTimeZone,
    durationMinutes: durationMinutesForReservation(
      reservation,
      page.durationMinutes,
    ),
    hostDisplayName,
    status: reservation.status,
    bookingSlug: page.bookingSlug,
    guestName: reservation.guestName,
    notes: reservation.notes,
    createsGoogleMeet: createsGoogleMeetFromConference(conference),
    conference,
  });
};

const nextGuestNotes = (
  incoming: string | undefined,
  current: string | null,
): string | null => {
  if (incoming === undefined) {
    return current;
  }
  return incoming.length > 0 ? incoming : null;
};

const destinationConference = async (
  userId: ObjectId,
  destinationCalendarId: string,
): Promise<CalendarConference> => {
  const local = await calendarService.getLocalCalendar(userId);
  if (local && local._id.toHexString() === destinationCalendarId) {
    return "none";
  }

  const client = getSyncServiceClient();
  const principal = toSyncPrincipal(userId.toString());
  const calendarsResult = await client.listCalendars(principal);
  if (!calendarsResult.ok) {
    return "meet";
  }
  const destination = calendarsResult.value.calendars.find(
    (calendar) => (calendar.id as string) === destinationCalendarId,
  );
  if (!destination) {
    return "none";
  }

  const connectionsResult = await client.listConnections(principal);
  const connection = connectionsResult.ok
    ? connectionsResult.value.connections.find(
        (candidate) => candidate.id === destination.connectionId,
      )
    : undefined;
  return conferenceForDestination(
    connection?.provider ?? "google",
    destination.createsGoogleMeet !== false,
    connection?.capabilities,
  );
};

/**
 * Every page-derived knob the slot engine reads, in one place.
 *
 * `getSlots` and `createReservation` must agree exactly on what the engine is
 * told, or a slot the guest was offered could be rejected (or, worse, accepted)
 * by the re-check. Building both inputs here removes the chance of the two
 * field literals drifting apart.
 */
const slotEngineInputForPage = (
  page: BookingPageRecord,
  availability: BusyAvailabilityResponse,
  confirmedReservationStarts: readonly Date[],
  window: { now: Date; windowStart: Date; windowEnd: Date },
): ComputeBookingSlotsInput => ({
  timeZone: page.timeZone,
  durationMinutes: page.durationMinutes,
  weeklyAvailability: page.weeklyAvailability,
  minNoticeHours: page.minNoticeHours,
  maxHorizonDays: page.maxHorizonDays,
  busyIntervals: availability.intervals
    .filter((interval) => occupiesBookingSlot(interval))
    .map((interval) => ({
      start: new Date(interval.start),
      end: new Date(interval.end),
    })),
  confirmedReservationStarts,
  now: window.now,
  windowStart: window.windowStart,
  windowEnd: window.windowEnd,
});

export class PublicBookingService {
  constructor(
    private readonly calendarBookingPort?: CalendarBookingPort,
    private readonly afterOverlapClaim: () => Promise<void> = async () => {},
  ) {}

  private get calendarBooking(): CalendarBookingPort {
    return this.calendarBookingPort ?? new CalendarBookingService();
  }

  private async losesOverlapClaim(
    pageId: ObjectId,
    slotStart: Date,
    slotEnd: Date,
    selfOperationId: ObjectId,
    selfReservationId: ObjectId,
  ): Promise<boolean> {
    const confirmedReservationIds =
      await bookingReservationRepository.listConfirmedOverlapping(
        pageId,
        slotStart,
        slotEnd,
      );
    const inFlight = await bookingOperationRepository.listInFlightOverlapping(
      pageId,
      slotStart,
      slotEnd,
    );
    return shouldYieldOverlap({
      selfOperationId,
      selfReservationId,
      confirmedReservationIds,
      inFlight,
    });
  }

  async getPublicPage(slug: string): Promise<PublicBookingPage> {
    const page = await resolveEnabledPage(slug);
    await assertHostAllowsGuestWrites(page.userId);
    const hostDisplayName = await getHostDisplayName(page.userId);
    const conference = await destinationConference(
      page.userId,
      page.destinationCalendarId,
    );
    return PublicBookingPageSchema.parse(
      toPublicBookingPage(page, hostDisplayName, conference),
    );
  }

  async getHostPageStatus(
    userId: ObjectId,
  ): Promise<BookingPageStatusResponse> {
    const page = await bookingPageRepository.findByUserId(userId);
    if (!page?.enabled) {
      return emptyBookableStatus();
    }
    const now = new Date();
    const probe = await probeBookability(
      page,
      {
        start: now,
        end: dayjs(now).add(page.maxHorizonDays, "day").toDate(),
      },
      this.calendarBooking,
    );
    return BookingPageStatusResponseSchema.parse(mapProbeToStatus(probe));
  }

  async getSlots(
    slug: string,
    rawQuery: unknown,
  ): Promise<BookingSlotsResponse> {
    const page = await resolveEnabledPage(slug);
    const query = parseSlotsQuery(rawQuery);
    return this.computeSlotsForPage(page, query);
  }

  async getReservationSlots(
    reservationId: ObjectId,
    rawQuery: unknown,
  ): Promise<BookingSlotsResponse> {
    guestTokenFrom(rawQuery);
    const query = BookingReservationSlotsQuerySchema.parse(rawQuery);
    const reservation = await loadGuestAuthorizedReservation(
      reservationId,
      query.token,
    );
    if (reservationClosedForGuestMutation(reservation)) {
      throw reservationNotFound();
    }
    const page = await resolveReservationPublicPage(reservation);
    parseSlotsQuery({
      start: query.start,
      end: query.end,
      timeZone: query.timeZone,
    });
    return this.computeSlotsForPage(page, query, {
      excludeEventIds: reservation.calendarEventId
        ? [reservation.calendarEventId as EventId]
        : undefined,
      omitReservationStart: reservation.slotStart,
    });
  }

  private async computeSlotsForPage(
    page: BookingPageRecord,
    query: { start: string; end: string },
    options: {
      excludeEventIds?: readonly EventId[];
      omitReservationStart?: Date;
    } = {},
  ): Promise<BookingSlotsResponse> {
    const now = new Date();
    const windowStart = new Date(query.start);
    const requestedEnd = new Date(query.end);
    const horizonEnd = dayjs(now).add(page.maxHorizonDays, "day").toDate();
    const windowEnd =
      requestedEnd.getTime() > horizonEnd.getTime() ? horizonEnd : requestedEnd;

    const reconciled = await reconcileBookingPageBlockingCalendars(page);
    const probe = await probeBookability(
      reconciled,
      { start: windowStart, end: windowEnd },
      this.calendarBooking,
      { excludeEventIds: options.excludeEventIds },
    );

    if (!probe.bookable) {
      if (probe.availability) {
        publicBookingSlotsLog.unbookable({
          slug: page.bookingSlug ?? "",
          userId: page.userId.toString(),
          complete: probe.availability.complete,
          issueReasons: probe.availability.issues.map((issue) => issue.reason),
          issueCalendarIds: probe.availability.issues.map(
            (issue) => issue.calendarId,
          ),
          connectionStates: probe.availability.connections.map(
            (connection) => connection.state,
          ),
        });
      }
      return BookingSlotsResponseSchema.parse({
        slots: [],
        bookable: false,
      });
    }

    const availability = probe.availability;
    if (!availability) {
      return BookingSlotsResponseSchema.parse({
        slots: [],
        bookable: true,
      });
    }

    const omitStartMs = options.omitReservationStart?.getTime();
    const confirmedStarts = (
      await bookingReservationRepository.listConfirmedStartsByPageId(
        page._id,
        confirmedReservationScanRange(page, windowStart, windowEnd),
      )
    ).filter((start) => start.getTime() !== omitStartMs);
    const slotStarts = computeBookingSlots(
      slotEngineInputForPage(page, availability, confirmedStarts, {
        now,
        windowStart,
        windowEnd,
      }),
    );

    return BookingSlotsResponseSchema.parse({
      bookable: true,
      slots: slotStarts.map((slotStart) => ({
        slotStart,
        slotEnd: slotEndForStart(
          new Date(slotStart),
          page.durationMinutes,
        ).toISOString(),
      })),
    });
  }

  private async assertSlotAvailable(
    page: BookingPageRecord,
    slotStart: Date,
    slotEnd: Date,
    options: {
      excludeEventIds?: readonly EventId[];
      omitReservationStart?: Date;
    } = {},
  ): Promise<void> {
    const reconciled = await reconcileBookingPageBlockingCalendars(page);
    const destinationReason = destinationReadinessReason(
      reconciled.destinationCalendarId as string,
      await loadDestinationCatalog(reconciled.userId.toString()),
    );
    if (destinationReason) {
      throw bookingError("SLOT_UNAVAILABLE", GUEST_PAGE_NOT_ACCEPTING_BOOKINGS);
    }
    const now = new Date();
    const minNoticeMs = reconciled.minNoticeHours * 60 * 60 * 1000;
    if (slotStart.getTime() < now.getTime() + minNoticeMs) {
      throw bookingError(
        "SLOT_UNAVAILABLE",
        "Selected slot is no longer available",
      );
    }

    const availability = await this.calendarBooking.getAvailability(
      reconciled.userId.toString(),
      {
        calendarIds: reconciled.blockingCalendarIds,
        start: DateTimeSchema.parse(slotStart.toISOString()),
        end: DateTimeSchema.parse(slotEnd.toISOString()),
        ...(options.excludeEventIds
          ? { excludeEventIds: options.excludeEventIds }
          : {}),
      },
    );
    if (!availability.bookable) {
      throw bookingError(
        "SLOT_UNAVAILABLE",
        "Meeting is temporarily unavailable",
      );
    }

    const omitStartMs = options.omitReservationStart?.getTime();
    const confirmedStarts = (
      await bookingReservationRepository.listConfirmedStartsByPageId(
        page._id,
        confirmedReservationScanRange(page, slotStart, slotEnd),
      )
    ).filter((start) => start.getTime() !== omitStartMs);
    const allowedStarts = new Set(
      computeBookingSlots(
        slotEngineInputForPage(page, availability, confirmedStarts, {
          now,
          windowStart: slotStart,
          windowEnd: slotEnd,
        }),
      ).map((start) => Date.parse(start)),
    );
    if (!allowedStarts.has(slotStart.getTime())) {
      throw bookingError(
        "SLOT_UNAVAILABLE",
        "Selected slot is no longer available",
      );
    }
  }

  async createReservation(slug: string, rawInput: unknown) {
    const page = await resolveEnabledPage(slug);
    await assertHostAllowsGuestWrites(page.userId);
    const input = CreateBookingReservationInputSchema.parse(rawInput);
    assertGuestEmail(input.guestEmail);
    assertPinnedDuration(input.durationMinutes, page.durationMinutes);

    const slotStart = new Date(input.slotStart);
    const slotEnd = slotEndForStart(slotStart, input.durationMinutes);

    const existingIntent =
      await bookingOperationRepository.findActiveCreateByIntent(
        page._id,
        slotStart,
        input.guestEmail,
      );
    if (existingIntent) {
      return this.resumeCreateOperation(page, existingIntent);
    }

    const overlapping =
      await bookingReservationRepository.listConfirmedOverlapping(
        page._id,
        slotStart,
        slotEnd,
      );
    for (const overlappingId of overlapping) {
      const existing =
        await bookingReservationRepository.findById(overlappingId);
      if (
        existing &&
        existing.slotStart.getTime() === slotStart.getTime() &&
        existing.guestEmail === input.guestEmail
      ) {
        const createOp =
          await bookingOperationRepository.findCreateByReservationId(
            existing._id,
          );
        if (createOp) {
          return this.toCreateResponse(createOp);
        }
      }
    }

    await this.assertSlotAvailable(page, slotStart, slotEnd);

    const cancelToken = generateCancelToken();
    const reservationId = mongoService.objectId();
    const eventId = EventIdSchema.parse(mongoService.objectId().toHexString());
    const operation = await bookingOperationRepository.insertCreate({
      _id: mongoService.objectId(),
      kind: "create",
      status: "pending",
      reservationId,
      pageId: page._id,
      userId: page.userId,
      calendarId: page.destinationCalendarId,
      eventId,
      slotStart,
      slotEnd,
      guestName: input.guestName,
      guestEmail: input.guestEmail,
      notes: input.notes?.trim() ?? null,
      guestTimeZone: input.guestTimeZone,
      cancelToken,
    });
    return this.resumeCreateOperation(page, operation);
  }

  async getPublicReservation(
    reservationId: ObjectId,
  ): Promise<PublicGetBookingReservationResponse> {
    const reservation =
      await bookingReservationRepository.findById(reservationId);
    if (!reservation) {
      throw reservationNotFound();
    }

    const page = await resolveReservationPublicPage(reservation);
    return presentReservation(
      reservation,
      page,
      await getHostDisplayName(page.userId),
    );
  }

  async patchPublicReservation(reservationId: ObjectId, rawInput: unknown) {
    const input = PatchBookingReservationInputSchema.parse(rawInput);
    const reservation = await loadGuestAuthorizedReservation(
      reservationId,
      input.token,
    );

    if (reservationClosedForGuestMutation(reservation)) {
      throw reservationNotFound();
    }

    const page = await resolveReservationPublicPage(reservation);

    const guestName = input.name ?? reservation.guestName;
    const notes = nextGuestNotes(input.notes, reservation.notes);
    const hostDisplayName = await getHostDisplayName(page.userId);
    const { cancelUrl, rescheduleUrl } = guestActionUrls(
      reservationId.toString(),
      input.token,
    );

    const inFlight =
      await bookingOperationRepository.findInFlightByReservationId(
        reservationId,
      );
    if (inFlight?.kind === "cancel") {
      throw reservationNotFound();
    }
    if (inFlight?.kind === "reschedule") {
      throw reservationConflict();
    }

    let operation: EditBookingOperationRecord;
    try {
      operation =
        inFlight?.kind === "edit"
          ? inFlight
          : await bookingOperationRepository.insertEdit({
              _id: mongoService.objectId(),
              kind: "edit",
              status: "pending",
              reservationId,
              pageId: page._id,
              userId: page.userId,
              calendarId: page.destinationCalendarId,
              eventId: reservation.calendarEventId,
              guestName,
              notes,
              cancelToken: input.token,
            });
    } catch (error) {
      if (!isDuplicateSlotError(error)) {
        throw error;
      }
      const existing =
        await bookingOperationRepository.findInFlightByReservationId(
          reservationId,
        );
      if (existing?.kind === "cancel") {
        throw reservationNotFound();
      }
      throw reservationConflict();
    }

    if (operation.guestName !== guestName || operation.notes !== notes) {
      throw reservationConflict();
    }

    return this.resumeEditOperation(
      page,
      reservation,
      operation,
      hostDisplayName,
      cancelUrl,
      rescheduleUrl,
    );
  }

  async rescheduleReservation(reservationId: ObjectId, rawInput: unknown) {
    guestTokenFrom(rawInput);
    const input = RescheduleBookingReservationInputSchema.parse(rawInput);
    const reservation = await loadGuestAuthorizedReservation(
      reservationId,
      input.token,
    );
    if (reservationClosedForGuestMutation(reservation)) {
      throw reservationNotFound();
    }
    const page = await resolveReservationPublicPage(reservation);
    await assertHostAllowsGuestWrites(page.userId);
    assertPinnedDuration(input.durationMinutes, page.durationMinutes);

    const slotStart = new Date(input.slotStart);
    const slotEnd = slotEndForStart(slotStart, input.durationMinutes);
    const hostDisplayName = await getHostDisplayName(page.userId);
    const present = (record: BookingReservationRecord) =>
      RescheduleBookingReservationResponseSchema.parse({
        reservationId: record._id.toString(),
        slotStart: record.slotStart.toISOString(),
        slotEnd: record.slotEnd.toISOString(),
        guestTimeZone: record.guestTimeZone,
        durationMinutes: durationMinutesForReservation(
          record,
          page.durationMinutes,
        ),
        hostDisplayName,
        status: record.status,
        bookingSlug: page.bookingSlug,
      });

    if (slotStart.getTime() === reservation.slotStart.getTime()) {
      return present(reservation);
    }

    const inFlight =
      await bookingOperationRepository.findInFlightByReservationId(
        reservationId,
      );
    if (inFlight?.kind === "cancel") {
      throw reservationNotFound();
    }
    if (inFlight?.kind === "edit") {
      throw reservationConflict();
    }
    if (
      inFlight?.kind === "reschedule" &&
      inFlight.slotStart.getTime() !== slotStart.getTime()
    ) {
      throw reservationConflict();
    }

    await this.assertSlotAvailable(page, slotStart, slotEnd, {
      excludeEventIds: reservation.calendarEventId
        ? [reservation.calendarEventId as EventId]
        : undefined,
      omitReservationStart: reservation.slotStart,
    });

    let operation: RescheduleBookingOperationRecord;
    try {
      operation =
        inFlight?.kind === "reschedule"
          ? inFlight
          : await bookingOperationRepository.insertReschedule({
              _id: mongoService.objectId(),
              kind: "reschedule",
              status: "pending",
              reservationId,
              pageId: page._id,
              userId: page.userId,
              calendarId: page.destinationCalendarId,
              eventId: reservation.calendarEventId,
              slotStart,
              slotEnd,
              previousSlotStart: reservation.slotStart,
              previousSlotEnd: reservation.slotEnd,
              guestTimeZone: input.guestTimeZone,
            });
    } catch (error) {
      if (!isDuplicateSlotError(error)) {
        throw error;
      }
      const existing =
        await bookingOperationRepository.findInFlightByReservationId(
          reservationId,
        );
      if (existing?.kind === "cancel") {
        throw reservationNotFound();
      }
      throw reservationConflict();
    }

    if (operation.slotStart.getTime() !== slotStart.getTime()) {
      throw reservationConflict();
    }

    return this.resumeRescheduleOperation(
      page,
      reservation,
      operation,
      present,
    );
  }

  async cancelReservation(
    reservationId: ObjectId,
    rawInput: unknown,
  ): Promise<void> {
    const { token } = CancelBookingReservationInputSchema.parse(rawInput);
    const reservation = await loadGuestAuthorizedReservation(
      reservationId,
      token,
    );
    await this.finalizeCancel(reservation);
  }

  async recoverDueOperations(): Promise<void> {
    const leaseUntil = new Date(Date.now() + BOOKING_OPERATION_CLAIM_LEASE_MS);
    const due = await bookingOperationRepository.claimDue(
      BOOKING_OPERATION_RETRY_BATCH_SIZE,
      leaseUntil,
    );
    for (const operation of due) {
      if (operation.attemptCount >= BOOKING_OPERATION_MAX_ATTEMPTS) {
        await bookingOperationRepository.markFailed(
          operation._id,
          operation.lastError,
        );
        continue;
      }
      try {
        if (operation.kind === "create") {
          await this.recoverCreateOperation(operation);
        } else if (operation.kind === "cancel") {
          await this.recoverCancelOperation(operation);
        } else if (operation.kind === "edit") {
          await this.recoverEditOperation(operation);
        } else {
          await this.recoverRescheduleOperation(operation);
        }
      } catch (error) {
        if (isSlotUnavailable(error)) {
          continue;
        }
        await bookingOperationRepository.scheduleRetry(
          operation._id,
          new Date(
            Date.now() + bookingOperationBackoffMs(operation.attemptCount),
          ),
          truncatedOperationError(error),
        );
      }
    }
  }

  startRecoveryRetries = (): void => {
    if (this.#recoveryTimer) return;
    this.#runRecoveryCycle();
    this.#recoveryTimer = setInterval(() => {
      this.#runRecoveryCycle();
    }, BOOKING_OPERATION_RETRY_INTERVAL_MS);
  };

  stopRecoveryRetries = async (): Promise<void> => {
    if (this.#recoveryTimer) {
      clearInterval(this.#recoveryTimer);
      this.#recoveryTimer = undefined;
    }
    await this.#pendingRecoveryCycle;
  };

  #recoveryTimer: ReturnType<typeof setInterval> | undefined;
  #pendingRecoveryCycle: Promise<void> | undefined;

  #runRecoveryCycle = (): void => {
    const cycle = this.recoverDueOperations().catch((error: unknown) => {
      logger.error(
        "Could not recover interrupted booking operations",
        error instanceof Error
          ? { message: error.message }
          : { error: String(error) },
      );
    });
    this.#pendingRecoveryCycle = cycle;
    void cycle.finally(() => {
      if (this.#pendingRecoveryCycle === cycle) {
        this.#pendingRecoveryCycle = undefined;
      }
    });
  };

  private toCreateResponse(operation: CreateBookingOperationRecord) {
    const { cancelUrl, rescheduleUrl } = guestActionUrls(
      operation.reservationId.toString(),
      operation.cancelToken,
    );
    return CreateBookingReservationResponseSchema.parse({
      reservationId: operation.reservationId.toString(),
      slotStart: operation.slotStart.toISOString(),
      slotEnd: operation.slotEnd.toISOString(),
      guestTimeZone: operation.guestTimeZone,
      cancelUrl,
      rescheduleUrl,
    });
  }

  private async recoverEditOperation(
    operation: EditBookingOperationRecord,
  ): Promise<void> {
    const page = await bookingPageRepository.findById(operation.pageId);
    const reservation = await bookingReservationRepository.findById(
      operation.reservationId,
    );
    if (
      !page?.bookingSlug ||
      !reservation ||
      reservationClosedForGuestMutation(reservation)
    ) {
      await bookingOperationRepository.markStatus(operation._id, "compensated");
      return;
    }
    const hostDisplayName = await getHostDisplayName(page.userId);
    const { cancelUrl, rescheduleUrl } = guestActionUrls(
      reservation._id.toString(),
      operation.cancelToken,
    );
    await this.resumeEditOperation(
      { ...page, bookingSlug: page.bookingSlug },
      reservation,
      operation,
      hostDisplayName,
      cancelUrl,
      rescheduleUrl,
    );
  }

  private async resumeEditOperation(
    page: BookingPageRecord & { bookingSlug: string },
    reservation: BookingReservationRecord,
    operation: EditBookingOperationRecord,
    hostDisplayName: string,
    cancelUrl: string,
    rescheduleUrl: string,
  ) {
    if (
      operation.status === "compensating" ||
      operation.status === "compensated" ||
      operation.status === "failed"
    ) {
      await bookingOperationRepository.markStatus(operation._id, "compensated");
      throw reservationConflict();
    }

    const latest = await bookingReservationRepository.findById(
      operation.reservationId,
    );
    if (
      latest &&
      latest.guestName === operation.guestName &&
      latest.notes === operation.notes &&
      operation.status === "submitted"
    ) {
      await bookingOperationRepository.markStatus(operation._id, "confirmed");
      return presentReservation(latest, page, hostDisplayName);
    }

    let current = operation;
    if (current.status === "pending" || current.status === "failed") {
      const eventId = reservation.calendarEventId ?? current.eventId;
      if (eventId) {
        try {
          await this.calendarBooking.updateBookingEvent(
            page.userId.toString(),
            {
              eventId: eventId as EventId,
              title: `${current.guestName} and ${hostDisplayName}`,
              description: bookingEventDescription(
                current.notes,
                cancelUrl,
                rescheduleUrl,
              ),
              timeZone: page.timeZone,
              guest: {
                email: reservation.guestEmail,
                displayName: current.guestName,
              },
              operationId: current._id.toHexString(),
            },
          );
        } catch (error) {
          if (
            error instanceof EventMutationException &&
            error.mutationCode === "RECURRENCE_CONFLICT"
          ) {
            await bookingOperationRepository.markStatus(
              current._id,
              "compensated",
            );
            asBookingProviderConflict(error);
          }
          await bookingOperationRepository.scheduleRetry(
            current._id,
            new Date(
              Date.now() + bookingOperationBackoffMs(current.attemptCount),
            ),
            truncatedOperationError(error),
          );
          throw error;
        }
      }
      const submitted = await bookingOperationRepository.markStatus(
        current._id,
        "submitted",
      );
      if (submitted?.kind === "edit") {
        current = submitted;
      } else {
        current = { ...current, status: "submitted" };
      }
    }

    const updated = await bookingReservationRepository.updateGuestDetails(
      operation.reservationId,
      { guestName: current.guestName, notes: current.notes },
    );
    if (!updated) {
      throw reservationNotFound();
    }
    await bookingOperationRepository.markStatus(current._id, "confirmed");
    return presentReservation(updated, page, hostDisplayName);
  }

  private async recoverRescheduleOperation(
    operation: RescheduleBookingOperationRecord,
  ): Promise<void> {
    const page = await bookingPageRepository.findById(operation.pageId);
    const reservation = await bookingReservationRepository.findById(
      operation.reservationId,
    );
    if (
      !page ||
      !reservation ||
      reservationClosedForGuestMutation(reservation)
    ) {
      await bookingOperationRepository.markStatus(operation._id, "compensated");
      return;
    }
    const hostDisplayName = await getHostDisplayName(page.userId);
    const present = (record: BookingReservationRecord) =>
      RescheduleBookingReservationResponseSchema.parse({
        reservationId: record._id.toString(),
        slotStart: record.slotStart.toISOString(),
        slotEnd: record.slotEnd.toISOString(),
        guestTimeZone: record.guestTimeZone,
        durationMinutes: durationMinutesForReservation(
          record,
          page.durationMinutes,
        ),
        hostDisplayName,
        status: record.status,
        bookingSlug: page.bookingSlug ?? "",
      });
    await this.resumeRescheduleOperation(page, reservation, operation, present);
  }

  private async resumeRescheduleOperation(
    page: BookingPageRecord,
    reservation: BookingReservationRecord,
    operation: RescheduleBookingOperationRecord,
    present: (
      record: BookingReservationRecord,
    ) => ReturnType<typeof RescheduleBookingReservationResponseSchema.parse>,
  ) {
    if (
      operation.status === "compensating" ||
      operation.status === "compensated" ||
      operation.status === "failed"
    ) {
      await this.compensateRescheduleOperation(operation);
      throw bookingError(
        "SLOT_UNAVAILABLE",
        "Selected slot is no longer available",
      );
    }

    const latest = await bookingReservationRepository.findById(
      operation.reservationId,
    );
    if (
      latest &&
      latest.slotStart.getTime() === operation.slotStart.getTime()
    ) {
      if (operation.status !== "confirmed") {
        await bookingOperationRepository.markStatus(operation._id, "confirmed");
      }
      return present(latest);
    }

    let current = operation;
    if (current.status === "pending" || current.status === "failed") {
      await this.afterOverlapClaim();
      if (
        await this.losesOverlapClaim(
          page._id,
          current.slotStart,
          current.slotEnd,
          current._id,
          current.reservationId,
        )
      ) {
        await bookingOperationRepository.markStatus(current._id, "compensated");
        throw bookingError(
          "SLOT_UNAVAILABLE",
          "Selected slot is no longer available",
        );
      }
      if (reservation.calendarEventId) {
        try {
          await this.calendarBooking.updateBookingEvent(
            page.userId.toString(),
            {
              eventId: reservation.calendarEventId as EventId,
              start: DateTimeSchema.parse(current.slotStart.toISOString()),
              end: DateTimeSchema.parse(current.slotEnd.toISOString()),
              timeZone: page.timeZone,
              guest: {
                email: reservation.guestEmail,
                displayName: reservation.guestName,
              },
              operationId: current._id.toHexString(),
            },
          );
        } catch (error) {
          if (
            error instanceof EventMutationException &&
            error.mutationCode === "RECURRENCE_CONFLICT"
          ) {
            await bookingOperationRepository.markStatus(
              current._id,
              "compensated",
            );
            asBookingProviderConflict(error);
          }
          await bookingOperationRepository.scheduleRetry(
            current._id,
            new Date(
              Date.now() + bookingOperationBackoffMs(current.attemptCount),
            ),
            truncatedOperationError(error),
          );
          throw error;
        }
      }
      const submitted = await bookingOperationRepository.markStatus(
        current._id,
        "submitted",
      );
      if (submitted?.kind === "reschedule") {
        current = submitted;
      } else {
        current = { ...current, status: "submitted" };
      }
    }

    try {
      const updated = await bookingReservationRepository.updateSlotTimes(
        operation.reservationId,
        {
          slotStart: current.slotStart,
          slotEnd: current.slotEnd,
          guestTimeZone: current.guestTimeZone,
        },
        current.previousSlotStart,
      );
      if (!updated) {
        const stored = await bookingReservationRepository.findById(
          operation.reservationId,
        );
        if (
          stored &&
          stored.slotStart.getTime() === current.slotStart.getTime()
        ) {
          await bookingOperationRepository.markStatus(current._id, "confirmed");
          return present(stored);
        }
        throw reservationConflict();
      }
      await bookingOperationRepository.markStatus(current._id, "confirmed");
      return present(updated);
    } catch (error) {
      if (isDuplicateSlotError(error)) {
        await this.compensateRescheduleOperation(current);
        throw bookingError(
          "SLOT_UNAVAILABLE",
          "Selected slot is no longer available",
        );
      }
      throw error;
    }
  }

  private async compensateRescheduleOperation(
    operation: RescheduleBookingOperationRecord,
  ): Promise<void> {
    await bookingOperationRepository.markStatus(operation._id, "compensating");
    const reservation = await bookingReservationRepository.findById(
      operation.reservationId,
    );
    const page = await bookingPageRepository.findById(operation.pageId);
    const eventId = reservation?.calendarEventId ?? operation.eventId;
    if (eventId && reservation) {
      try {
        await this.calendarBooking.updateBookingEvent(
          operation.userId.toString(),
          {
            eventId: eventId as EventId,
            start: DateTimeSchema.parse(
              operation.previousSlotStart.toISOString(),
            ),
            end: DateTimeSchema.parse(operation.previousSlotEnd.toISOString()),
            timeZone: page?.timeZone ?? reservation.guestTimeZone,
            guest: {
              email: reservation.guestEmail,
              displayName: reservation.guestName,
            },
            operationId: `${operation._id.toHexString()}:revert`,
          },
        );
      } catch (compensationError: unknown) {
        await bookingOperationRepository.scheduleRetry(
          operation._id,
          new Date(
            Date.now() + bookingOperationBackoffMs(operation.attemptCount),
          ),
          truncatedOperationError(compensationError),
        );
        return;
      }
    }
    if (
      reservation &&
      reservation.slotStart.getTime() === operation.slotStart.getTime()
    ) {
      await bookingReservationRepository.updateSlotTimes(
        operation.reservationId,
        {
          slotStart: operation.previousSlotStart,
          slotEnd: operation.previousSlotEnd,
          guestTimeZone: operation.guestTimeZone,
        },
        operation.slotStart,
      );
    }
    await bookingOperationRepository.markStatus(operation._id, "compensated");
  }

  private async recoverCreateOperation(
    operation: CreateBookingOperationRecord,
  ): Promise<void> {
    const page = await bookingPageRepository.findById(operation.pageId);
    if (!page) {
      await this.compensateCreateOperation(operation);
      return;
    }
    try {
      await this.resumeCreateOperation(page, operation);
    } catch (error) {
      if (isSlotUnavailable(error)) {
        return;
      }
      throw error;
    }
  }

  private async recoverCancelOperation(
    operation: CancelBookingOperationRecord,
  ): Promise<void> {
    const reservation = await bookingReservationRepository.findById(
      operation.reservationId,
    );
    if (!reservation) {
      if (operation.eventId) {
        await this.calendarBooking.deleteBookingEvent(
          operation.userId.toString(),
          { eventId: operation.eventId as EventId },
        );
      }
      await bookingOperationRepository.markStatus(operation._id, "confirmed");
      return;
    }
    await this.finalizeCancel(reservation, operation);
  }

  private async resumeCreateOperation(
    page: BookingPageRecord,
    operation: CreateBookingOperationRecord,
  ) {
    if (
      operation.status === "compensating" ||
      operation.status === "compensated" ||
      operation.status === "failed"
    ) {
      await this.compensateCreateOperation(operation);
      throw bookingError(
        "SLOT_UNAVAILABLE",
        "Selected slot is no longer available",
      );
    }

    const existingReservation = await bookingReservationRepository.findById(
      operation.reservationId,
    );
    if (existingReservation?.status === "confirmed") {
      if (operation.status !== "confirmed") {
        await bookingOperationRepository.markStatus(operation._id, "confirmed");
      }
      return this.toCreateResponse(operation);
    }

    let current = operation;
    if (current.status === "pending" || current.status === "failed") {
      await this.afterOverlapClaim();
      if (
        await this.losesOverlapClaim(
          page._id,
          current.slotStart,
          current.slotEnd,
          current._id,
          current.reservationId,
        )
      ) {
        if (current.status === "pending") {
          await bookingOperationRepository.markStatus(
            current._id,
            "compensated",
          );
        } else {
          await this.compensateCreateOperation(current);
        }
        throw bookingError(
          "SLOT_UNAVAILABLE",
          "Selected slot is no longer available",
        );
      }
      await this.assertSlotAvailable(page, current.slotStart, current.slotEnd, {
        excludeEventIds: [current.eventId as EventId],
      });
      const hostDisplayName = await getHostDisplayName(page.userId);
      const conference = await destinationConference(
        page.userId,
        page.destinationCalendarId,
      );
      const { cancelUrl, rescheduleUrl } = guestActionUrls(
        current.reservationId.toString(),
        current.cancelToken,
      );
      try {
        await this.calendarBooking.createBookingEvent(page.userId.toString(), {
          calendarId: page.destinationCalendarId,
          eventId: current.eventId as EventId,
          title: `${current.guestName} and ${hostDisplayName}`,
          description: bookingEventDescription(
            current.notes,
            cancelUrl,
            rescheduleUrl,
          ),
          start: DateTimeSchema.parse(current.slotStart.toISOString()),
          end: DateTimeSchema.parse(current.slotEnd.toISOString()),
          timeZone: page.timeZone,
          guest: {
            email: current.guestEmail,
            displayName: current.guestName,
          },
          createConference: conference !== "none",
        });
      } catch (error) {
        await bookingOperationRepository.scheduleRetry(
          current._id,
          new Date(
            Date.now() + bookingOperationBackoffMs(current.attemptCount),
          ),
          truncatedOperationError(error),
        );
        throw error;
      }
      const submitted = await bookingOperationRepository.markStatus(
        current._id,
        "submitted",
      );
      if (submitted?.kind === "create") {
        current = submitted;
      } else {
        current = { ...current, status: "submitted" };
      }
    }

    try {
      const alreadyInserted = await bookingReservationRepository.findById(
        current.reservationId,
      );
      if (!alreadyInserted) {
        await bookingReservationRepository.insert({
          _id: current.reservationId,
          pageId: page._id,
          slotStart: current.slotStart,
          slotEnd: current.slotEnd,
          guestName: current.guestName,
          guestEmail: current.guestEmail,
          notes: current.notes,
          guestTimeZone: current.guestTimeZone,
          status: "confirmed",
          calendarEventId: current.eventId,
          cancelTokenHash: hashCancelToken(current.cancelToken),
        });
      }
    } catch (error) {
      if (!isDuplicateSlotError(error)) {
        throw error;
      }
      const inserted = await bookingReservationRepository.findById(
        current.reservationId,
      );
      if (!inserted) {
        await this.compensateCreateOperation(current);
        throw bookingError(
          "SLOT_UNAVAILABLE",
          "Selected slot is no longer available",
        );
      }
    }

    const overlapping =
      await bookingReservationRepository.listConfirmedOverlapping(
        page._id,
        current.slotStart,
        current.slotEnd,
      );
    if (overlapping.some((id) => !id.equals(current.reservationId))) {
      await this.compensateCreateOperation(current);
      throw bookingError(
        "SLOT_UNAVAILABLE",
        "Selected slot is no longer available",
      );
    }

    await bookingOperationRepository.markStatus(current._id, "confirmed");
    return this.toCreateResponse(current);
  }

  private async compensateCreateOperation(
    operation: CreateBookingOperationRecord,
  ): Promise<void> {
    await bookingOperationRepository.markStatus(operation._id, "compensating");
    await bookingReservationRepository.deleteById(operation.reservationId);
    const principal = toSyncPrincipal(operation.userId.toString());
    try {
      await this.calendarBooking.deleteBookingEvent(
        operation.userId.toString(),
        { eventId: operation.eventId as EventId },
      );
      await bookingOperationRepository.markStatus(operation._id, "compensated");
    } catch (compensationError: unknown) {
      publicBookingCompensationLog.failed(compensationError, {
        tenantId: principal.tenantId,
        principalId: principal.principalId,
        calendarId: operation.calendarId,
        eventId: operation.eventId,
        slotStart: operation.slotStart.toISOString(),
      });
      await bookingOperationRepository.scheduleRetry(
        operation._id,
        new Date(
          Date.now() + bookingOperationBackoffMs(operation.attemptCount),
        ),
        truncatedOperationError(compensationError),
      );
    }
  }

  private async finalizeCancel(
    reservation: BookingReservationRecord,
    existingOperation?: CancelBookingOperationRecord,
  ): Promise<void> {
    const page = await resolveReservationPage(reservation);
    let operation = existingOperation;
    if (!operation) {
      try {
        operation = await bookingOperationRepository.insertCancel({
          _id: mongoService.objectId(),
          kind: "cancel",
          status: "pending",
          reservationId: reservation._id,
          pageId: reservation.pageId,
          userId: page.userId,
          calendarId: page.destinationCalendarId,
          eventId: reservation.calendarEventId,
        });
      } catch (error) {
        if (!isDuplicateSlotError(error)) {
          throw error;
        }
        const existing =
          await bookingOperationRepository.findInFlightByReservationId(
            reservation._id,
          );
        if (existing?.kind === "reschedule") {
          throw reservationConflict();
        }
        if (existing?.kind === "cancel") {
          operation = existing;
        } else {
          throw error;
        }
      }
    }

    if (!operation) {
      throw reservationConflict();
    }

    if (reservation.status === "confirmed") {
      await bookingReservationRepository.markCancelling(reservation._id);
    }

    const latest = await bookingReservationRepository.findById(reservation._id);
    if (!latest) {
      await bookingOperationRepository.markStatus(operation._id, "confirmed");
      return;
    }

    if (latest.status === "cancelled" && !latest.calendarEventId) {
      await bookingOperationRepository.markStatus(operation._id, "confirmed");
      return;
    }

    const eventId = latest.calendarEventId ?? operation.eventId;
    if (eventId) {
      try {
        await this.calendarBooking.deleteBookingEvent(page.userId.toString(), {
          eventId: eventId as EventId,
        });
      } catch (error) {
        await bookingOperationRepository.scheduleRetry(
          operation._id,
          new Date(
            Date.now() + bookingOperationBackoffMs(operation.attemptCount),
          ),
          truncatedOperationError(error),
        );
        throw error;
      }
    }

    await bookingReservationRepository.markCancelled(reservation._id);
    await bookingReservationRepository.clearCalendarEventId(reservation._id);
    await bookingOperationRepository.markStatus(operation._id, "confirmed");
  }
}

export default new PublicBookingService();
