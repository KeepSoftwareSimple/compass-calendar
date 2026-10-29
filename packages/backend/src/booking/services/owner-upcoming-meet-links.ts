import { type ObjectId } from "mongodb";
import { Logger } from "@core/logger/winston.logger";
import { DateTimeSchema } from "@core/types/domain-primitives";
import { SyncEventCalendarIdSchema } from "@core/types/sync/event.contracts";
import { isVirtualMeetingUrl } from "@core/util/conference/virtual-meeting-url";
import { type BookingReservationRecord } from "@backend/booking/booking-reservation.record";
import { toSyncPrincipal } from "@backend/common/services/sync-service/sync-principal";
import { getSyncServiceClient } from "@backend/common/services/sync-service/sync-service.factory";
import { unwrapSyncResult } from "@backend/common/services/sync-service/unwrap-sync-result";

const logger = Logger("app:booking.owner-upcoming");

const pickMeetLink = (
  conference: { url: string; label: string | null } | null,
): string | null => {
  const url = conference?.url?.trim();
  if (!url || !isVirtualMeetingUrl(url)) {
    return null;
  }
  return url;
};

export async function resolveMeetLinksByEventId(
  userId: ObjectId,
  destinationCalendarId: string,
  reservations: readonly BookingReservationRecord[],
): Promise<Map<string, string | null>> {
  const linked = reservations.filter(
    (
      reservation,
    ): reservation is BookingReservationRecord & {
      calendarEventId: string;
    } => typeof reservation.calendarEventId === "string",
  );
  if (linked.length === 0) {
    return new Map();
  }

  const rangeStart = linked.reduce(
    (earliest, reservation) =>
      reservation.slotStart < earliest ? reservation.slotStart : earliest,
    linked[0]!.slotStart,
  );
  const rangeEnd = linked.reduce(
    (latest, reservation) =>
      reservation.slotEnd > latest ? reservation.slotEnd : latest,
    linked[0]!.slotEnd,
  );

  const client = getSyncServiceClient();
  const principal = toSyncPrincipal(userId.toString());
  const calendarId = SyncEventCalendarIdSchema.parse(destinationCalendarId);
  const meetLinks = new Map<string, string | null>();

  let cursor: string | undefined;
  do {
    const result = await client.listFullEvents(principal, {
      calendarIds: [calendarId],
      start: DateTimeSchema.parse(rangeStart.toISOString()),
      end: DateTimeSchema.parse(rangeEnd.toISOString()),
      cursor,
      limit: 500,
    });
    const page = unwrapSyncResult(result, {
      logger,
      logMessage: "Failed to load booking event conferences",
      userMessage: "Could not load meeting links. Try again shortly.",
    });
    for (const instance of page.instances) {
      meetLinks.set(
        instance.eventId,
        pickMeetLink(instance.content.conference),
      );
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor);

  return meetLinks;
}
