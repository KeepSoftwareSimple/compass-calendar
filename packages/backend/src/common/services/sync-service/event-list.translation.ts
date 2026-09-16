import { type Event } from "@core/types/event.contracts";
import { withColor, withColorHex } from "@core/types/event-color.contracts";
import { type SyncEventInstance } from "@core/types/sync/event.contracts";
import { composeOccurrenceId } from "./occurrence-id";

const toBrowserDetails = (content: SyncEventInstance["content"]) => ({
  kind: "details" as const,
  title: content.title,
  description: content.description,
  location: content.location,
  organizer: content.organizer,
  attendees: content.attendees,
  conference: content.conference,
  ...withColor(content.color),
  ...withColorHex(content.colorHex),
});

// Translate one sync full-fidelity instance into the browser Event contract.
// D1=II: singles and series-master rows keep the real eventId; projected
// occurrences get a composed id the write path can reverse. content.kind is
// always "details" (sync always carries title+description). calendarId passes
// through as the sync calendar id (S39 option 2 — no legacy bridge).
export const syncEventInstanceToBrowser = (
  instance: SyncEventInstance,
): Event => {
  const shared = {
    // Sync's calendar id IS the browser's calendar id (S39 option 2), but the
    // two contracts brand it separately. Assert just this field so the rest of
    // the translated event stays type-checked against EventSchema.
    calendarId: instance.calendarId as Event["calendarId"],
    content: toBrowserDetails(instance.content),
    schedule: instance.schedule,
    createdAt: instance.createdAt,
    updatedAt: instance.updatedAt,
    // Absent stays absent: the browser contract treats a missing key as "the
    // provider reported no correlation key", not as an empty one.
    ...(instance.icalUid ? { icalUid: instance.icalUid } : {}),
    ...(instance.providerManaged
      ? { providerManaged: instance.providerManaged }
      : {}),
  };

  // EventInstanceListResponseSchema already validated this instance on the
  // HMAC-signed internal channel. Re-running EventSchema.parse here doubled
  // timezone construction on every range read, so the return type is the only
  // thing checking these shapes now: keep the assertions field-level.
  switch (instance.recurrence.kind) {
    case "single":
      return {
        ...shared,
        id: instance.eventId,
        recurrence: { kind: "single" },
      };
    case "series":
      return {
        ...shared,
        id: instance.eventId,
        recurrence: { kind: "series", rules: instance.recurrence.rules },
      };
    case "occurrence":
      return {
        ...shared,
        // The shared codec composes plain strings; decodeOccurrenceId reverses
        // this exact format back into an eventId the write path can address.
        id: composeOccurrenceId({
          eventId: instance.eventId,
          recurrenceId: instance.recurrence.recurrenceId,
        }) as Event["id"],
        recurrence: { kind: "occurrence", seriesId: instance.eventId },
      };
  }
};
