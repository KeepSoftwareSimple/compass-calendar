import { type CalendarId, type EventId } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import { type AttendeeInput } from "@core/types/event-attendance.contracts";
import { type EventColorSlot } from "@core/types/event-color.contracts";
import { type RecurrenceScope } from "@core/types/event-command.contracts";

// Drafts use required keys with nullable incomplete values. This confines
// form checks to one place without recreating the optional-property problem.
export type EventScheduleDraft =
  | {
      kind: "timed";
      start: Date | null;
      end: Date | null;
      timeZone: string | null;
    }
  | {
      kind: "allDay";
      start: Date | null;
      end: Date | null;
    };

export type NewEventRecurrenceDraft =
  | { kind: "single" }
  | { kind: "series"; rules: string[] };

export type EditEventRecurrenceDraft =
  | { kind: "preserve" }
  | NewEventRecurrenceDraft;

type SharedEventFormValues = {
  title: string;
  description: string;
  // Same convention as description: empty string means no location.
  location: string;
  schedule: EventScheduleDraft;
  // Null means calendar-default / no event color tag.
  color: EventColorSlot | null;
  // Guest-list edit state, mirroring EditableContentSchema.attendees: absent
  // means the draft never touched guests (saves omit attendees — preserve
  // semantics); present, including [], means "replace membership with exactly
  // this set" on save.
  attendees?: readonly AttendeeInput[];
};

// A new draft can only use "single" or "series" and has no irrelevant
// recurrence scope.
export type NewEventFormValues = SharedEventFormValues & {
  calendarId: CalendarId | null;
  recurrence: NewEventRecurrenceDraft;
  // Ask the provider to mint a meeting link on save (the "Add <kind>"
  // switch). Create-only: sync has no conference channel on update. Absent
  // or false means no link.
  createConference?: boolean;
};

// An edit starts with "preserve", so the backend retains the stored
// single/series/occurrence identity unless the user explicitly changes
// recurrence. The client never submits a seriesId.
export type EditEventFormValues = SharedEventFormValues & {
  calendarId: CalendarId;
  recurrence: EditEventRecurrenceDraft;
  scope: RecurrenceScope;
};

export type EventFormValues = NewEventFormValues | EditEventFormValues;

type DraftState<TValues extends EventFormValues> = {
  values: TValues;
  isDirty: boolean;
  submitError: string | null;
};

export type NewEventDraft = DraftState<NewEventFormValues> & {
  mode: "create";
};

// originalCalendarId is displayed but never included in ReplaceEventInput,
// so an edit cannot move an existing event between calendars.
export type EditEventDraft = DraftState<EditEventFormValues> & {
  mode: "edit";
  eventId: EventId;
  originalCalendarId: CalendarId;
};

export type EventDraft = NewEventDraft | EditEventDraft;

export type GridScheduleDraft = Extract<
  EventScheduleDraft,
  { kind: "timed" | "allDay" }
> & {
  start: Date;
  end: Date;
};

type GridDraftValues<TValues extends EventFormValues> = Omit<
  TValues,
  "schedule"
> & {
  schedule: GridScheduleDraft;
};

export type GridEventDraft =
  | {
      kind: "create";
      source: null;
      /**
       * Optional client-assigned id for a not-yet-saved draft. Lets
       * placeholder-matching code (e.g. dayCalendarDraft.util.ts) recognize
       * the same in-progress draft across re-renders before it has a
       * server-issued id.
       */
      clientId?: EventId;
      values: GridDraftValues<NewEventFormValues>;
    }
  | {
      kind: "edit";
      source: Event;
      values: GridDraftValues<EditEventFormValues>;
    };
