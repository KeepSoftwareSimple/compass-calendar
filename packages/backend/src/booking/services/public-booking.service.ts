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
import { DateTimeSchema, type EventId } from "@core/types/domain-primitives";
import {
  BUSY_QUERY_MAX_WINDOW_MS,
  type BusyAvailabilityResponse,
} from "@core/types/sync/availability.contracts";
import dayjs from "@core/util/date/dayjs";
import { bookingError } from "@backend/booking/booking.error";
import {
  generateCancelToken,
  guestActionTokenAuthorizes,
  hashCancelToken,
} from "@backend/booking/booking-cancel-token";
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

const compensationFailureCause = (error: unknown): string => {
  if (error instanceof BaseError) return error.result;
  if (error instanceof Error) return error.message;
  return String(error);
};

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
  constructor(private readonly calendarBookingPort?: CalendarBookingPort) {}

  private get calendarBooking(): CalendarBookingPort {
    return this.calendarBookingPort ?? new CalendarBookingService();
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
    if (reservation.status === "cancelled") {
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
    await this.assertSlotAvailable(page, slotStart, slotEnd);

    const hostDisplayName = await getHostDisplayName(page.userId);
    const conference = await destinationConference(
      page.userId,
      page.destinationCalendarId,
    );
    const cancelToken = generateCancelToken();
    const reservationId = mongoService.objectId();
    const { cancelUrl, rescheduleUrl } = guestActionUrls(
      reservationId.toString(),
      cancelToken,
    );

    let calendarEventId: EventId | null = null;
    try {
      calendarEventId = await this.calendarBooking.createBookingEvent(
        page.userId.toString(),
        {
          calendarId: page.destinationCalendarId,
          title: `${input.guestName} and ${hostDisplayName}`,
          description: bookingEventDescription(
            input.notes,
            cancelUrl,
            rescheduleUrl,
          ),
          start: input.slotStart,
          end: DateTimeSchema.parse(slotEnd.toISOString()),
          timeZone: page.timeZone,
          guest: {
            email: input.guestEmail,
            displayName: input.guestName,
          },
          createConference: conference !== "none",
        },
      );

      const reservation = await bookingReservationRepository.insert({
        _id: reservationId,
        pageId: page._id,
        slotStart,
        slotEnd,
        guestName: input.guestName,
        guestEmail: input.guestEmail,
        notes: input.notes?.trim() ?? null,
        guestTimeZone: input.guestTimeZone,
        status: "confirmed",
        calendarEventId,
        cancelTokenHash: hashCancelToken(cancelToken),
      });

      // Close the overlap race the unique index cannot see: the index only
      // serializes identical starts, but two concurrent confirms on adjacent
      // grid starts (10:00 and 10:15 for a 30-minute duration) both pass the
      // pre-insert engine check. Re-checking after our own insert guarantees
      // the later checker sees both docs, so at most one overlapping
      // reservation survives; in the rare symmetric case both yield 409 and
      // the slot reopens. Deliberately not "smallest _id wins": ids are minted
      // before the slow calendar call, so id order does not track insert order
      // and both racers could each conclude they had won.
      const overlapping =
        await bookingReservationRepository.listConfirmedOverlapping(
          page._id,
          slotStart,
          slotEnd,
        );
      if (overlapping.some((id) => !id.equals(reservationId))) {
        await bookingReservationRepository.deleteById(reservationId);
        throw bookingError(
          "SLOT_UNAVAILABLE",
          "Selected slot is no longer available",
        );
      }

      return CreateBookingReservationResponseSchema.parse({
        reservationId: reservation._id.toString(),
        slotStart: reservation.slotStart.toISOString(),
        slotEnd: reservation.slotEnd.toISOString(),
        guestTimeZone: reservation.guestTimeZone,
        cancelUrl,
        rescheduleUrl,
      });
    } catch (error) {
      if (calendarEventId) {
        const eventId = calendarEventId;
        const principal = toSyncPrincipal(page.userId.toString());
        await this.calendarBooking
          .deleteBookingEvent(page.userId.toString(), {
            eventId,
          })
          .catch((compensationError: unknown) => {
            // The guest still gets SLOT_UNAVAILABLE. Log enough to find and
            // remove the orphaned Google event by hand.
            publicBookingCompensationLog.failed(compensationError, {
              tenantId: principal.tenantId,
              principalId: principal.principalId,
              calendarId: page.destinationCalendarId,
              eventId,
              slotStart: slotStart.toISOString(),
            });
          });
      }
      if (isDuplicateSlotError(error)) {
        throw bookingError(
          "SLOT_UNAVAILABLE",
          "Selected slot is no longer available",
        );
      }
      throw error;
    }
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

    if (reservation.status === "cancelled") {
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

    if (reservation.calendarEventId) {
      await this.calendarBooking.updateBookingEvent(page.userId.toString(), {
        eventId: reservation.calendarEventId as EventId,
        title: `${guestName} and ${hostDisplayName}`,
        description: bookingEventDescription(notes, cancelUrl, rescheduleUrl),
        start: DateTimeSchema.parse(reservation.slotStart.toISOString()),
        end: DateTimeSchema.parse(reservation.slotEnd.toISOString()),
        timeZone: page.timeZone,
        guest: {
          email: reservation.guestEmail,
          displayName: guestName,
        },
      });
    }

    const updated = await bookingReservationRepository.updateGuestDetails(
      reservationId,
      { guestName, notes },
    );
    if (!updated) {
      throw reservationNotFound();
    }

    return presentReservation(updated, page, hostDisplayName);
  }

  async rescheduleReservation(reservationId: ObjectId, rawInput: unknown) {
    guestTokenFrom(rawInput);
    const input = RescheduleBookingReservationInputSchema.parse(rawInput);
    const reservation = await loadGuestAuthorizedReservation(
      reservationId,
      input.token,
    );
    if (reservation.status === "cancelled") {
      throw reservationNotFound();
    }
    const page = await resolveReservationPublicPage(reservation);
    await assertHostAllowsGuestWrites(page.userId);
    assertPinnedDuration(input.durationMinutes, page.durationMinutes);

    const slotStart = new Date(input.slotStart);
    const slotEnd = slotEndForStart(slotStart, input.durationMinutes);
    const hostDisplayName = await getHostDisplayName(page.userId);
    const { cancelUrl, rescheduleUrl } = guestActionUrls(
      reservationId.toString(),
      input.token,
    );
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

    await this.assertSlotAvailable(page, slotStart, slotEnd, {
      excludeEventIds: reservation.calendarEventId
        ? [reservation.calendarEventId as EventId]
        : undefined,
      omitReservationStart: reservation.slotStart,
    });

    if (reservation.calendarEventId) {
      await this.calendarBooking.updateBookingEvent(page.userId.toString(), {
        eventId: reservation.calendarEventId as EventId,
        title: `${reservation.guestName} and ${hostDisplayName}`,
        description: bookingEventDescription(
          reservation.notes,
          cancelUrl,
          rescheduleUrl,
        ),
        start: input.slotStart,
        end: DateTimeSchema.parse(slotEnd.toISOString()),
        timeZone: page.timeZone,
        guest: {
          email: reservation.guestEmail,
          displayName: reservation.guestName,
        },
      });
    }

    try {
      const updated = await bookingReservationRepository.updateSlotTimes(
        reservationId,
        {
          slotStart,
          slotEnd,
          guestTimeZone: input.guestTimeZone,
        },
      );
      if (!updated) {
        throw reservationNotFound();
      }
      return present(updated);
    } catch (error) {
      if (isDuplicateSlotError(error)) {
        throw bookingError(
          "SLOT_UNAVAILABLE",
          "Selected slot is no longer available",
        );
      }
      throw error;
    }
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
    const page = await resolveReservationPage(reservation);

    // Cancel local state first so a crash after the provider delete cannot
    // leave a confirmed row occupying the slot. Retry still deletes while
    // `calendarEventId` remains.
    if (reservation.status === "confirmed") {
      await bookingReservationRepository.markCancelled(reservationId);
    }

    if (!reservation.calendarEventId) {
      return;
    }

    await this.calendarBooking.deleteBookingEvent(page.userId.toString(), {
      eventId: reservation.calendarEventId as EventId,
    });
    await bookingReservationRepository.clearCalendarEventId(reservationId);
  }
}

export default new PublicBookingService();
