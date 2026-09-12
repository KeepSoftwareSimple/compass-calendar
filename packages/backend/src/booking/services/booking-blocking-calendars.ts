import { type ObjectId } from "mongodb";
import {
  nextOptedOutBlockingCalendarIds,
  withDiscoveredBlockingCalendarIds,
} from "@core/booking/merge-blocking-calendars";
import {
  type CalendarId,
  CalendarIdSchema,
} from "@core/types/domain-primitives";
import { type ProviderCalendar } from "@core/types/sync/connection.contracts";
import { type BookingPageRecord } from "@backend/booking/booking-page.record";
import { bookingPageRepository } from "@backend/booking/booking-page.repository";
import calendarService from "@backend/calendar/services/calendar.service";
import { toSyncPrincipal } from "@backend/common/services/sync-service/sync-principal";
import { getSyncServiceClient } from "@backend/common/services/sync-service/sync-service.factory";

const asCalendarId = (value: string): CalendarId | null => {
  const parsed = CalendarIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const eligibleIdFromProviderCalendar = (
  calendar: ProviderCalendar,
): CalendarId | null => {
  // Sync names the availability-read capability `canReadBusy`; the browser
  // Calendar contract calls the same idea `canReadAvailability`.
  if (!calendar.active || !calendar.capabilities.canReadBusy) return null;
  return asCalendarId(calendar.id as string);
};

export const listEligibleBlockingCalendarIds = async (
  userId: ObjectId,
): Promise<CalendarId[]> => {
  const ids: CalendarId[] = [];
  const seen = new Set<CalendarId>();
  const add = (calendarId: CalendarId | null) => {
    if (!calendarId || seen.has(calendarId)) return;
    seen.add(calendarId);
    ids.push(calendarId);
  };

  const client = getSyncServiceClient();
  try {
    const calendarsResult = await client.listCalendars(
      toSyncPrincipal(userId.toString()),
    );
    if (calendarsResult.ok) {
      for (const calendar of calendarsResult.value.calendars) {
        add(eligibleIdFromProviderCalendar(calendar));
      }
    }
  } catch {
    // Discovery is unavailable; keep existing blockers and still include local.
  }

  const localCalendar = await calendarService.getLocalCalendar(userId);
  if (localCalendar) {
    add(asCalendarId(localCalendar._id.toHexString()));
  }
  return ids;
};

export const optedOutBlockingCalendarIdsForPut = async (
  userId: ObjectId,
  submitted: readonly CalendarId[],
  previousOptedOut: readonly CalendarId[] | undefined,
  eligible?: readonly CalendarId[],
): Promise<CalendarId[]> =>
  nextOptedOutBlockingCalendarIds({
    previousOptedOut: previousOptedOut ?? [],
    eligible: eligible ?? (await listEligibleBlockingCalendarIds(userId)),
    submitted,
  });

export const reconcileBookingPageBlockingCalendars = async (
  page: BookingPageRecord,
  eligible?: readonly CalendarId[],
): Promise<BookingPageRecord> => {
  const discovered =
    eligible ?? (await listEligibleBlockingCalendarIds(page.userId));
  const next = withDiscoveredBlockingCalendarIds(
    page,
    page.optedOutBlockingCalendarIds ?? [],
    discovered,
  );
  if (next === page) return page;

  const current = new Set(page.blockingCalendarIds);
  const added = next.blockingCalendarIds.filter((id) => !current.has(id));
  const updated = await bookingPageRepository.addBlockingCalendarIds(
    page.userId,
    added,
  );
  return updated ?? next;
};
