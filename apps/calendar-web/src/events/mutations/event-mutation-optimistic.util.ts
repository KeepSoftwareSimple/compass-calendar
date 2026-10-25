import {
  DateTimeSchema,
  type EventId,
  EventIdSchema,
} from "@core/types/domain-primitives";
import { type Event, type EventRecurrence } from "@core/types/event.contracts";
import {
  type Attendee,
  type AttendeeInput,
  type RsvpResponseStatus,
} from "@core/types/event-attendance.contracts";
import {
  type CreateEventInput,
  type RecurrenceScope,
  type ReplaceEventInput,
} from "@core/types/event-command.contracts";
import { rootSeriesMasterId } from "@core/util/occurrence-id";

const nowDateTime = () => DateTimeSchema.parse(new Date().toISOString());

export function seriesIdOf(event: Event | null | undefined): EventId | null {
  if (event?.recurrence.kind === "occurrence") return event.recurrence.seriesId;
  if (event?.recurrence.kind === "series") return event.id;
  return null;
}

export function readAttendees(
  attendees: CreateEventInput["content"]["attendees"],
): readonly Attendee[] | undefined {
  if (attendees === undefined) return undefined;
  const withStatus = attendees.filter(
    (attendee): attendee is Attendee => "responseStatus" in attendee,
  );
  return withStatus.length === attendees.length ? withStatus : undefined;
}

export function isGuestEditInput(
  attendees: CreateEventInput["content"]["attendees"],
): attendees is readonly AttendeeInput[] {
  return (
    attendees?.every((attendee) => !("responseStatus" in attendee)) ?? false
  );
}

export function optimisticGuestList(
  intended: readonly AttendeeInput[],
  existing: readonly Attendee[] | undefined,
): readonly Attendee[] {
  const byEmail = new Map(
    (existing ?? []).map((attendee) => [
      attendee.email.toLowerCase(),
      attendee,
    ]),
  );
  return intended.map(
    (attendee) =>
      byEmail.get(attendee.email.toLowerCase()) ?? {
        email: attendee.email,
        displayName: attendee.displayName,
        responseStatus: "needsAction" as const,
      },
  );
}

export function optimisticAttendeesFromInput(
  attendees: CreateEventInput["content"]["attendees"],
  existing?: readonly Attendee[],
) {
  return isGuestEditInput(attendees)
    ? optimisticGuestList(attendees, existing)
    : readAttendees(attendees);
}

export function rsvpEventContent(
  event: Event,
  accountEmail: string,
  responseStatus: RsvpResponseStatus,
): Event {
  if (event.content.kind !== "details" || !event.content.attendees) {
    return event;
  }
  return {
    ...event,
    content: {
      ...event.content,
      attendees: event.content.attendees.map((attendee) =>
        attendee.email.toLowerCase() === accountEmail.toLowerCase()
          ? { ...attendee, responseStatus }
          : attendee,
      ),
    },
  };
}

export function optimisticEventFromCreate(input: CreateEventInput): Event {
  const { attendees, ...details } = input.content;
  const optimisticAttendees = optimisticAttendeesFromInput(attendees);
  return {
    id: input.id as EventId,
    calendarId: input.calendarId,
    content:
      optimisticAttendees === undefined
        ? details
        : { ...details, attendees: optimisticAttendees },
    schedule: input.schedule,
    recurrence: input.recurrence as EventRecurrence,
    createdAt: nowDateTime(),
    updatedAt: null,
  };
}

export function mergeReplaceContent(
  existing: Event["content"],
  input: ReplaceEventInput["content"],
): Event["content"] {
  const { attendees, ...details } = input;
  const existingAttendees =
    existing.kind === "details" ? existing.attendees : undefined;
  const optimisticAttendees = optimisticAttendeesFromInput(
    attendees,
    existingAttendees,
  );
  const replayInput =
    optimisticAttendees === undefined
      ? details
      : { ...details, attendees: optimisticAttendees };
  if (existing.kind !== "details") return replayInput;
  if (replayInput.kind === "details" && replayInput.color !== undefined) {
    const { colorHex: _cleared, ...withoutHex } = existing;
    return { ...withoutHex, ...replayInput };
  }
  return { ...existing, ...replayInput };
}

export function mergeReplaceInput(
  existing: Event,
  input: ReplaceEventInput,
): Event {
  const recurrence: EventRecurrence =
    input.recurrence.kind === "preserve"
      ? existing.recurrence
      : input.recurrence.kind === "series"
        ? { kind: "series", rules: input.recurrence.rules }
        : { kind: "single" };

  return {
    ...existing,
    calendarId: input.calendarId ?? existing.calendarId,
    content: mergeReplaceContent(existing.content, input.content),
    schedule: input.schedule,
    recurrence,
    updatedAt: nowDateTime(),
  };
}

export function seriesWriteKey(
  original: Event | null,
  scope: RecurrenceScope,
  fallbackId: EventId,
): EventId {
  if (scope === "this" || !original) return fallbackId;
  const seriesId =
    original.recurrence.kind === "occurrence"
      ? original.recurrence.seriesId
      : original.recurrence.kind === "series"
        ? original.id
        : fallbackId;
  return EventIdSchema.parse(rootSeriesMasterId(seriesId));
}
