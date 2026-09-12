import { MongoServerError, type ObjectId } from "mongodb";
import {
  type AdminGetBookingPageResult,
  type AdminPutBookingPageInput,
  AdminPutBookingPageInputSchema,
  allocateBookingSlug,
  type BookingNewMeetingsClaimResponse,
  BookingNewMeetingsClaimResponseSchema,
  buildDefaultAdminPutInput,
} from "@core/types/booking.contracts";
import { type TimeZone, TimeZoneSchema } from "@core/types/domain-primitives";
import { type ProviderCalendar } from "@core/types/sync/connection.contracts";
import { assertBillingAllowsWrites } from "@backend/billing/billing.guard";
import { bookingError } from "@backend/booking/booking.error";
import {
  mapBookingPageRecordToAdminResponse,
  mapBookingPageRecordToSetupResponse,
  mapPutInputToRecordFields,
} from "@backend/booking/booking-page.mapper";
import { bookingPageRepository } from "@backend/booking/booking-page.repository";
import { bookingReservationRepository } from "@backend/booking/booking-reservation.repository";
import {
  optedOutBlockingCalendarIdsForPut,
  reconcileBookingPageBlockingCalendars,
} from "@backend/booking/services/booking-blocking-calendars";
import calendarService from "@backend/calendar/services/calendar.service";
import mongoService from "@backend/common/services/mongo.service";
import { toSyncPrincipal } from "@backend/common/services/sync-service/sync-principal";
import { throwSyncProxyFailure } from "@backend/common/services/sync-service/sync-proxy-error";
import {
  type SyncPrincipal,
  type SyncServiceClient,
} from "@backend/common/services/sync-service/sync-service.client";
import { getSyncServiceClient } from "@backend/common/services/sync-service/sync-service.factory";

const SLUG_ALLOCATION_MAX_ATTEMPTS = 8;
const FALLBACK_HOST_TIME_ZONE = TimeZoneSchema.parse("UTC");

type SlugSource = "requested" | "allocated";

const emailLocalPart = (email: string): string => email.split("@")[0] ?? email;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const resolveHostTimeZone = async (userId: ObjectId): Promise<TimeZone> => {
  const calendars = await calendarService.list(userId);
  const ranked = [
    ...calendars.filter((calendar) => calendar.isPrimary),
    ...calendars.filter((calendar) => !calendar.isPrimary),
  ];
  for (const calendar of ranked) {
    if (calendar.timeZone) {
      return TimeZoneSchema.parse(calendar.timeZone);
    }
  }
  return FALLBACK_HOST_TIME_ZONE;
};

const assertTimeZoneForEnable = (rawInput: unknown): void => {
  if (!isRecord(rawInput) || rawInput["enabled"] !== true) {
    return;
  }
  const timeZone = rawInput["timeZone"];
  if (typeof timeZone !== "string" || timeZone.trim() === "") {
    throw bookingError(
      "TIMEZONE_REQUIRED",
      "Choose a meeting timezone before enabling",
    );
  }
};

const listSyncContext = async (
  userId: string,
): Promise<{
  calendars: readonly ProviderCalendar[];
  healthyConnectionIds: ReadonlySet<string>;
}> => {
  const client: Pick<SyncServiceClient, "listCalendars" | "listConnections"> =
    getSyncServiceClient();
  const principal: SyncPrincipal = toSyncPrincipal(userId);
  const [calendarsResult, connectionsResult] = await Promise.all([
    client.listCalendars(principal),
    client.listConnections(principal),
  ]);
  if (!calendarsResult.ok) {
    throwSyncProxyFailure(
      calendarsResult.error.kind,
      `Failed to list calendars from sync (${calendarsResult.error.kind})`,
      calendarsResult.error.detail,
    );
  }
  const healthyConnectionIds = new Set(
    (connectionsResult.ok ? connectionsResult.value.connections : [])
      .filter((connection) => connection.state === "healthy")
      .map((connection) => connection.id as string),
  );
  return { calendars: calendarsResult.value.calendars, healthyConnectionIds };
};

const assertHealthyWritableDestinationForEnable = async (
  userId: string,
  input: AdminPutBookingPageInput,
): Promise<void> => {
  const { calendars, healthyConnectionIds } = await listSyncContext(userId);
  if (healthyConnectionIds.size === 0) {
    throw bookingError(
      "CALENDAR_NOT_CONNECTED",
      "Connect a healthy calendar account before enabling your meeting page",
    );
  }

  const destination = calendars.find(
    (calendar) =>
      (calendar.id as string) === (input.destinationCalendarId as string) &&
      calendar.capabilities.canWriteEvents &&
      healthyConnectionIds.has(calendar.connectionId as string),
  );
  if (!destination) {
    throw bookingError(
      "DESTINATION_NOT_WRITABLE",
      "Destination calendar must be writable",
    );
  }

  const availabilityIds = new Set(
    calendars
      .filter((calendar) => calendar.capabilities.canReadBusy)
      .map((calendar) => calendar.id as string),
  );
  const localCalendar = await calendarService.getLocalCalendar(userId);
  if (localCalendar) {
    availabilityIds.add(localCalendar._id.toHexString());
  }
  const invalidBlocking = input.blockingCalendarIds.find(
    (calendarId) => !availabilityIds.has(calendarId as string),
  );
  if (invalidBlocking) {
    throw bookingError(
      "BLOCKING_CALENDAR_INVALID",
      "Blocking calendars must be readable for availability",
    );
  }
};

const suggestSlugForUser = async (userId: ObjectId): Promise<string> => {
  const user = await mongoService.user.findOne(
    { _id: userId },
    { projection: { name: 1, email: 1 } },
  );
  if (!user) {
    throw bookingError("INVALID_INPUT", "User not found");
  }

  const taken = await bookingPageRepository.listTakenSlugs();
  return allocateBookingSlug(
    user.name,
    emailLocalPart(user.email),
    userId.toString(),
    taken,
  );
};

const isDuplicateSlugError = (error: unknown): boolean =>
  error instanceof MongoServerError && error.code === 11000;

const resolveSuggestedSlug = async (
  userId: ObjectId,
  bookingSlug: string | undefined,
): Promise<string> => bookingSlug ?? (await suggestSlugForUser(userId));

const toAdminResult = async (
  userId: ObjectId,
  saved: Awaited<ReturnType<typeof bookingPageRepository.upsertByUserId>>,
): Promise<AdminGetBookingPageResult> => {
  if (saved.enabled && saved.bookingSlug) {
    return mapBookingPageRecordToAdminResponse({
      ...saved,
      bookingSlug: saved.bookingSlug,
    });
  }

  return mapBookingPageRecordToSetupResponse(
    saved,
    await resolveSuggestedSlug(userId, saved.bookingSlug),
  );
};

class BookingPageService {
  async getAdminPage(userId: ObjectId): Promise<AdminGetBookingPageResult> {
    const existing = await bookingPageRepository.findByUserId(userId);
    if (!existing) {
      const timeZone = await resolveHostTimeZone(userId);
      return {
        ...buildDefaultAdminPutInput(timeZone),
        isConfigured: false,
        suggestedSlug: await suggestSlugForUser(userId),
      };
    }

    const record = await reconcileBookingPageBlockingCalendars(existing);
    return toAdminResult(userId, record);
  }

  async putAdminPage(
    userId: ObjectId,
    rawInput: unknown,
  ): Promise<AdminGetBookingPageResult> {
    assertTimeZoneForEnable(rawInput);
    const input = AdminPutBookingPageInputSchema.parse(rawInput);
    if (input.enabled && input.weeklyAvailability.length === 0) {
      throw bookingError(
        "AVAILABILITY_REQUIRED",
        "Add weekly hours before turning on your meeting page",
      );
    }

    if (input.enabled) {
      await assertBillingAllowsWrites(userId.toString());
      await assertHealthyWritableDestinationForEnable(userId.toString(), input);
    }

    const existing = await bookingPageRepository.findByUserId(userId);
    const optedOutBlockingCalendarIds = existing
      ? await optedOutBlockingCalendarIdsForPut(
          userId,
          input.blockingCalendarIds,
          existing.optedOutBlockingCalendarIds,
        )
      : [];
    const fields = mapPutInputToRecordFields(input);
    let bookingSlug = existing?.bookingSlug;
    let slugSource: SlugSource = "allocated";

    if (input.slug !== undefined) {
      if (input.slug !== existing?.bookingSlug) {
        const taken = await bookingPageRepository.isSlugTakenByOther(
          input.slug,
          userId,
        );
        if (taken) {
          throw bookingError("SLUG_TAKEN", "That address is already taken");
        }
      }
      bookingSlug = input.slug;
      slugSource = "requested";
    } else if (input.enabled && !bookingSlug) {
      bookingSlug = await suggestSlugForUser(userId);
      slugSource = "allocated";
    }

    for (
      let attempt = 0;
      attempt < SLUG_ALLOCATION_MAX_ATTEMPTS;
      attempt += 1
    ) {
      try {
        const saved = await bookingPageRepository.upsertByUserId(userId, {
          ...fields,
          optedOutBlockingCalendarIds,
          ...(bookingSlug ? { bookingSlug } : {}),
        });

        return toAdminResult(
          userId,
          await reconcileBookingPageBlockingCalendars(saved),
        );
      } catch (error) {
        if (!isDuplicateSlugError(error)) {
          throw error;
        }
        if (slugSource === "requested") {
          throw bookingError("SLUG_TAKEN", "That address is already taken");
        }
        bookingSlug = await suggestSlugForUser(userId);
      }
    }

    throw bookingError(
      "INVALID_INPUT",
      "Could not persist meeting page due to slug collision",
    );
  }

  async claimNewMeetings(
    userId: ObjectId,
  ): Promise<BookingNewMeetingsClaimResponse> {
    const page = await bookingPageRepository.findByUserId(userId);
    if (!page?.enabled) {
      return BookingNewMeetingsClaimResponseSchema.parse({
        reservations: [],
      });
    }

    const since = page.hostNoticedAt ?? page.createdAt;
    const now = new Date();
    const stamped = await bookingPageRepository.stampHostNoticedAt(
      userId,
      page.hostNoticedAt,
      now,
    );
    if (!stamped) {
      return BookingNewMeetingsClaimResponseSchema.parse({
        reservations: [],
      });
    }

    const records =
      await bookingReservationRepository.listConfirmedCreatedSince(
        page._id,
        since,
      );
    return BookingNewMeetingsClaimResponseSchema.parse({
      reservations: records.map((record) => ({
        id: record._id.toString(),
        guestName: record.guestName,
        slotStart: record.slotStart.toISOString(),
        slotEnd: record.slotEnd.toISOString(),
      })),
    });
  }
}

export default new BookingPageService();
