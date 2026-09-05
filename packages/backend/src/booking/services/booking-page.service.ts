import { MongoServerError, type ObjectId } from "mongodb";
import {
  type AdminGetBookingPageResult,
  type AdminPutBookingPageInput,
  AdminPutBookingPageInputSchema,
  allocateBookingSlug,
} from "@core/types/booking.contracts";
import { type TimeZone, TimeZoneSchema } from "@core/types/domain-primitives";
import { type ProviderCalendar } from "@core/types/sync/connection.contracts";
import { assertBillingAllowsWrites } from "@backend/billing/billing.guard";
import { bookingError } from "@backend/booking/booking.error";
import {
  buildDefaultAdminPutInput,
  mapBookingPageRecordToAdminResponse,
  mapBookingPageRecordToSetupResponse,
  mapPutInputToRecordFields,
} from "@backend/booking/booking-page.mapper";
import { bookingPageRepository } from "@backend/booking/booking-page.repository";
import calendarService from "@backend/calendar/services/calendar.service";
import mongoService from "@backend/common/services/mongo.service";
import { resolveGoogleConnectionFromSync } from "@backend/common/services/sync-service/google-connection-status";
import { toSyncPrincipal } from "@backend/common/services/sync-service/sync-principal";
import { throwSyncProxyFailure } from "@backend/common/services/sync-service/sync-proxy-error";
import { getSyncServiceClient } from "@backend/common/services/sync-service/sync-service.factory";

const SLUG_ALLOCATION_MAX_ATTEMPTS = 8;
const FALLBACK_HOST_TIME_ZONE = TimeZoneSchema.parse("UTC");

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
      "Choose a booking timezone before enabling",
    );
  }
};

const assertHealthyGoogleForEnable = async (userId: string): Promise<void> => {
  const client = getSyncServiceClient();
  const connection = await resolveGoogleConnectionFromSync(
    client,
    toSyncPrincipal(userId),
  );
  if (connection.connectionState !== "HEALTHY") {
    throw bookingError(
      "GOOGLE_NOT_CONNECTED",
      "Connect a healthy calendar account before enabling booking",
    );
  }
};

const listSyncCalendars = async (
  userId: string,
): Promise<readonly ProviderCalendar[]> => {
  const client = getSyncServiceClient();
  const result = await client.listCalendars(toSyncPrincipal(userId));
  if (!result.ok) {
    throwSyncProxyFailure(
      result.error.kind,
      `Failed to list calendars from sync (${result.error.kind})`,
      result.error.detail,
    );
  }
  return result.value.calendars;
};

const assertCalendarsForEnable = async (
  userId: string,
  input: AdminPutBookingPageInput,
): Promise<void> => {
  const calendars = await listSyncCalendars(userId);
  const writable = calendars.filter(
    (calendar) => calendar.capabilities.canWriteEvents,
  );
  const destination = writable.find(
    (calendar) =>
      (calendar.id as string) === (input.destinationCalendarId as string),
  );
  if (!destination) {
    throw bookingError(
      "DESTINATION_NOT_WRITABLE",
      "Destination calendar must be a writable calendar",
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

const allocateSlugForUser = async (userId: ObjectId): Promise<string> => {
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

class BookingPageService {
  async getAdminPage(userId: ObjectId): Promise<AdminGetBookingPageResult> {
    const record = await bookingPageRepository.findByUserId(userId);
    if (!record) {
      const timeZone = await resolveHostTimeZone(userId);
      return { ...buildDefaultAdminPutInput(timeZone), isConfigured: false };
    }

    if (!record.bookingSlug) {
      return mapBookingPageRecordToSetupResponse(record);
    }

    return mapBookingPageRecordToAdminResponse({
      ...record,
      bookingSlug: record.bookingSlug,
    });
  }

  async putAdminPage(
    userId: ObjectId,
    rawInput: unknown,
  ): Promise<AdminGetBookingPageResult> {
    assertTimeZoneForEnable(rawInput);
    const input = AdminPutBookingPageInputSchema.parse(rawInput);

    if (input.enabled) {
      await assertBillingAllowsWrites(userId.toString());
      await assertHealthyGoogleForEnable(userId.toString());
      await assertCalendarsForEnable(userId.toString(), input);
    }

    const existing = await bookingPageRepository.findByUserId(userId);
    const fields = mapPutInputToRecordFields(input);
    let bookingSlug = existing?.bookingSlug;

    if (input.enabled && !bookingSlug) {
      bookingSlug = await allocateSlugForUser(userId);
    }

    for (
      let attempt = 0;
      attempt < SLUG_ALLOCATION_MAX_ATTEMPTS;
      attempt += 1
    ) {
      try {
        const saved = await bookingPageRepository.upsertByUserId(userId, {
          ...fields,
          ...(bookingSlug ? { bookingSlug } : {}),
        });

        if (!saved.bookingSlug) {
          return mapBookingPageRecordToSetupResponse(saved);
        }

        return mapBookingPageRecordToAdminResponse({
          ...saved,
          bookingSlug: saved.bookingSlug,
        });
      } catch (error) {
        if (!isDuplicateSlugError(error) || !input.enabled) {
          throw error;
        }
        bookingSlug = await allocateSlugForUser(userId);
      }
    }

    throw bookingError(
      "INVALID_INPUT",
      "Could not persist booking page due to slug collision",
    );
  }
}

export default new BookingPageService();
