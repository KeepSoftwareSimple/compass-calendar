import { type ObjectId } from "mongodb";
import {
  type CalendarConference,
  conferenceForDestination,
} from "@core/types/calendar.contracts";
import calendarService from "@backend/calendar/services/calendar.service";
import { toSyncPrincipal } from "@backend/common/services/sync-service/sync-principal";
import { getSyncServiceClient } from "@backend/common/services/sync-service/sync-service.factory";

/** Conference kind for a booking page destination (local, Meet, or Teams). */
export async function resolveBookingDestinationConference(
  userId: ObjectId,
  destinationCalendarId: string,
): Promise<CalendarConference> {
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
}
