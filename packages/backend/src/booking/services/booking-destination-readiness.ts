import {
  type BookingPageStatusReason,
  BookingPageStatusReasonSchema,
} from "@core/types/booking.contracts";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import {
  type ConnectionState,
  type ProviderCalendar,
} from "@core/types/sync/connection.contracts";
import { toSyncPrincipal } from "@backend/common/services/sync-service/sync-principal";
import { throwSyncProxyFailure } from "@backend/common/services/sync-service/sync-proxy-error";
import { getSyncServiceClient } from "@backend/common/services/sync-service/sync-service.factory";

export type DestinationCatalog = {
  calendars: readonly ProviderCalendar[];
  connections: readonly { id: string; state: ConnectionState }[];
};

const asCalendarId = (calendarId: string) => {
  const parsed = CalendarIdSchema.safeParse(calendarId);
  return parsed.success ? parsed.data : undefined;
};

// Destination health is independent of occupancy/blocking calendars: a
// healthy blocker must not mask a missing, read-only, or disconnected
// destination. Reasons stay on the existing host status union.
export const destinationReadinessReason = (
  destinationCalendarId: string,
  catalog: DestinationCatalog,
): BookingPageStatusReason | null => {
  const destinationId = asCalendarId(destinationCalendarId);
  const destination = catalog.calendars.find(
    (calendar) => (calendar.id as string) === destinationCalendarId,
  );
  // Retired provider calendars can still appear in an unfiltered list.
  // Booking writes need a currently listed destination, so treat inactive
  // the same as missing.
  if (!destination || destination.active === false) {
    return BookingPageStatusReasonSchema.parse({
      kind: "calendar",
      reason: "notImported",
      ...(destinationId ? { calendarId: destinationId } : {}),
    });
  }

  const connection = catalog.connections.find(
    (candidate) =>
      (candidate.id as string) === (destination.connectionId as string),
  );
  const state: ConnectionState = connection?.state ?? "disconnected";
  if (state !== "healthy") {
    return BookingPageStatusReasonSchema.parse({
      kind: "connection",
      reason: state,
      connectionState: state,
    });
  }

  if (!destination.capabilities.canWriteEvents) {
    return BookingPageStatusReasonSchema.parse({
      kind: "calendar",
      reason: "notWritable",
      ...(destinationId ? { calendarId: destinationId } : {}),
    });
  }

  return null;
};

export const loadDestinationCatalog = async (
  userId: string,
): Promise<DestinationCatalog> => {
  const client = getSyncServiceClient();
  const principal = toSyncPrincipal(userId);
  const [calendarsResult, connectionsResult] = await Promise.all([
    client.listCalendars(principal, { activeOnly: true }),
    client.listConnections(principal),
  ]);
  if (!calendarsResult.ok) {
    throwSyncProxyFailure(
      calendarsResult.error.kind,
      `Failed to list calendars from sync (${calendarsResult.error.kind})`,
      calendarsResult.error.detail,
    );
  }
  return {
    calendars: calendarsResult.value.calendars,
    connections: connectionsResult.ok
      ? connectionsResult.value.connections
      : [],
  };
};
