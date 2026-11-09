import {
  detectHostGuestRsvpReplies,
  type HostGuestRsvpEventSlice,
} from "@core/booking/host-guest-rsvp-reply.util";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import {
  type HostGuestRsvpObservationInsert,
  type HostGuestRsvpObservationRepository,
} from "@sync/storage/repositories/host-guest-rsvp-observation.repository";

const eventSliceFromRecord = (
  record: EventRecord,
): HostGuestRsvpEventSlice | null => {
  const { content, schedule } = record;
  if (!("organizer" in content)) return null;
  const scheduleKind = schedule.kind;
  const slotStart =
    scheduleKind === "timed"
      ? schedule.start
      : scheduleKind === "allDay"
        ? `${schedule.start}T12:00:00.000Z`
        : null;
  if (!slotStart) return null;

  return {
    organizer: content.organizer ?? null,
    attendees: (content.attendees ?? []).map((attendee) => ({
      email: attendee.email,
      displayName: attendee.displayName,
      responseStatus: attendee.responseStatus,
    })),
    slotStart,
  };
};

export const recordHostGuestRsvpObservations = async (
  observations: HostGuestRsvpObservationRepository,
  accountEmail: string,
  pairs: ReadonlyArray<{
    before: EventRecord | undefined;
    after: EventRecord;
  }>,
  firstObservedAt: Date,
): Promise<void> => {
  const inserts: HostGuestRsvpObservationInsert[] = [];

  for (const { before, after } of pairs) {
    if (!before) continue;
    const afterSlice = eventSliceFromRecord(after);
    if (!afterSlice) continue;
    const beforeSlice = eventSliceFromRecord(before);

    const replies = detectHostGuestRsvpReplies(
      beforeSlice,
      afterSlice,
      accountEmail,
    );
    for (const reply of replies) {
      inserts.push({
        tenantId: after.tenantId,
        principalId: after.principalId,
        eventId: after._id,
        reply,
        firstObservedAt,
      });
    }
  }

  await observations.recordReplies(inserts);
};
