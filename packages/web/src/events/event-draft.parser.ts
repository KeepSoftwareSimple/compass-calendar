import { type z } from "zod/v4";
import { type EventId } from "@core/types/domain-primitives";
import {
  type CreateEventInput,
  CreateEventInputSchema,
  type ReplaceEventInput,
  ReplaceEventInputSchema,
} from "@core/types/event-command.contracts";
import dayjs from "@core/util/date/dayjs";
import {
  type EditEventDraft,
  type EditEventRecurrenceDraft,
  type EventDraft,
  type EventScheduleDraft,
  type NewEventRecurrenceDraft,
} from "@web/events/event-draft.types";
import { inEffectiveTimeZone } from "@web/timezone/in-time-zone";

export type ParseEventDraftResult =
  | { ok: true; mode: "create"; input: CreateEventInput }
  | { ok: true; mode: "edit"; eventId: EventId; input: ReplaceEventInput }
  | { ok: false; fieldErrors: Record<string, string> };

// Candidate shapes are plain, unbranded data. CreateEventInputSchema /
// ReplaceEventInputSchema.safeParse is the only place that brands/validates
// them into a real command, so an incomplete or malformed draft can never
// produce one.
type TimedScheduleCandidate = {
  kind: "timed";
  start: string;
  end: string;
  timeZone: string;
};

type AllDayScheduleCandidate = {
  kind: "allDay";
  start: string;
  end: string;
};

type ScheduleCandidate = TimedScheduleCandidate | AllDayScheduleCandidate;

type RecurrenceCandidate =
  | { kind: "preserve" }
  | { kind: "single" }
  | { kind: "series"; rules: string[] };

function isValidTimeZone(timeZone: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_error) {
    return false;
  }
}

function toDateOnlyString(date: Date): string {
  return inEffectiveTimeZone(date).toYearMonthDayString();
}

// Formats the instant in the draft's own time zone so the offset matches the
// event's zone (not the browser's), mirroring toRFC3339OffsetString usage
// elsewhere in the app.
function toOffsetDateTimeString(date: Date, timeZone: string): string {
  return dayjs.tz(date, timeZone).format();
}

function buildSchedule(
  schedule: EventScheduleDraft,
  fieldErrors: Record<string, string>,
): ScheduleCandidate | null {
  if (schedule.kind === "timed") {
    const { start, end, timeZone } = schedule;

    if (start === null) fieldErrors.start = "Start is required";
    if (end === null) fieldErrors.end = "End is required";

    if (timeZone === null) {
      fieldErrors.timeZone = "Time zone is required";
    } else if (!isValidTimeZone(timeZone)) {
      fieldErrors.timeZone = "Invalid time zone";
    }

    if (
      start !== null &&
      end !== null &&
      end.getTime() <= start.getTime() &&
      !fieldErrors.end
    ) {
      fieldErrors.end = "End must be after start";
    }

    if (
      start === null ||
      end === null ||
      timeZone === null ||
      fieldErrors.end ||
      fieldErrors.timeZone
    ) {
      return null;
    }

    return {
      kind: "timed",
      start: toOffsetDateTimeString(start, timeZone),
      end: toOffsetDateTimeString(end, timeZone),
      timeZone,
    };
  }

  const { start, end } = schedule;

  if (start === null) fieldErrors.start = "Start is required";
  if (end === null) fieldErrors.end = "End is required";

  if (start === null || end === null) return null;

  const startStr = toDateOnlyString(start);
  let endStr = toDateOnlyString(end);

  if (endStr < startStr) {
    fieldErrors.end = "End must not be before start";
    return null;
  }

  // A same-day selection is valid input; normalize to an exclusive end by
  // adding one day, mirroring the legacy mapToBackend behavior. A
  // multi-day selection's end already represents an exclusive day and
  // passes through unchanged.
  if (endStr === startStr) {
    endStr = dayjs(endStr).add(1, "day").toYearMonthDayString();
  }

  return { kind: "allDay", start: startStr, end: endStr };
}

function buildRecurrenceRules(
  draft: NewEventRecurrenceDraft,
  fieldErrors: Record<string, string>,
): RecurrenceCandidate | null {
  if (draft.kind === "single") return { kind: "single" };

  const hasBlankRule = draft.rules.some((rule) => rule.trim() === "");

  if (draft.rules.length === 0 || hasBlankRule) {
    fieldErrors.recurrence = "Recurrence rules cannot be empty";
    return null;
  }

  return { kind: "series", rules: draft.rules };
}

function buildEditRecurrence(
  draft: EditEventRecurrenceDraft,
  fieldErrors: Record<string, string>,
): RecurrenceCandidate | null {
  if (draft.kind === "preserve") return { kind: "preserve" };

  return buildRecurrenceRules(draft, fieldErrors);
}

function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "root";

    if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
  }

  return fieldErrors;
}

export function parseEventDraft(draft: EventDraft): ParseEventDraftResult {
  const fieldErrors: Record<string, string> = {};

  if (draft.mode === "create" && draft.values.calendarId === null) {
    fieldErrors.calendarId = "Calendar is required";
  }

  const schedule = buildSchedule(draft.values.schedule, fieldErrors);

  const recurrence =
    draft.mode === "create"
      ? buildRecurrenceRules(draft.values.recurrence, fieldErrors)
      : buildEditRecurrence(draft.values.recurrence, fieldErrors);

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  // Local validation above guarantees these are non-null; the checks stay
  // here so control flow, not a cast, proves it to the type checker.
  if (schedule === null || recurrence === null) {
    return { ok: false, fieldErrors };
  }

  const content = {
    kind: "details" as const,
    title: draft.values.title,
    description: draft.values.description,
    location: draft.values.location,
    // Always include: a slot sets the tag, null clears it on edit (and is a
    // no-op clear on create). Omitting would preserve an existing sync color
    // on title-only saves that still carry an explicit draft color of null.
    color: draft.values.color,
    // Only a draft that touched the guest list carries attendees; omitted
    // means "not editing guests" and preserves the provider list (see
    // EditableContentSchema).
    ...(draft.values.attendees !== undefined
      ? { attendees: draft.values.attendees }
      : {}),
  };

  if (draft.mode === "create") {
    const candidate = {
      calendarId: draft.values.calendarId,
      content,
      schedule,
      recurrence,
      // Only a draft that switched the meeting link on carries the flag, so
      // an untouched save stays byte-identical to today's payload.
      ...(draft.values.createConference ? { createConference: true } : {}),
    };

    const parsed = CreateEventInputSchema.safeParse(candidate);

    if (!parsed.success) {
      return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
    }

    return { ok: true, mode: "create", input: parsed.data };
  }

  const editDraft: EditEventDraft = draft;
  const candidate = {
    content,
    schedule,
    recurrence,
    scope: editDraft.values.scope,
  };

  const parsed = ReplaceEventInputSchema.safeParse(candidate);

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  return {
    ok: true,
    mode: "edit",
    eventId: editDraft.eventId,
    input: parsed.data,
  };
}
