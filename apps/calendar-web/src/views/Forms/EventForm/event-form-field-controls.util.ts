export const EVENT_FORM_PLAIN_HOTKEY_OPTIONS = {
  enabled: true,
  ignoreInputs: false,
} as const;

export const EVENT_FORM_TITLE_ID = "event-form-title";
export const EVENT_FORM_LOCATION_ID = "event-form-location";
export const EVENT_FORM_ATTENDEES_ID = "event-form-attendees";
export const EVENT_FORM_DESCRIPTION_ID = "event-form-description";
export const EVENT_FORM_CALENDAR_ID = "event-form-calendar";
export const EVENT_FORM_COLOR_ID = "event-form-color";
export const EVENT_FORM_SCHEDULE_ID = "event-form-schedule";
export const EVENT_FORM_RECURRENCE_ID = "event-form-recurrence";
export const EVENT_FORM_RSVP_ID = "event-form-rsvp";

export const eventFormErrorId = (field: string) =>
  `event-form-error-${field.replaceAll(".", "-")}`;

// One control can stand for several validation fields (the schedule fieldset
// covers start/end/timeZone; the title covers both its nested and flat key).
// Resolving them in one place keeps a control's error ring, aria-invalid and
// aria-describedby in step, and makes adding a field a one-line change.
export interface EventFormFieldError {
  // The first candidate that actually failed, or null when none did.
  readonly field: string | null;
  // That field's message, for rendering.
  readonly message: string | undefined;
  // The id of its list entry, for aria-describedby.
  readonly describedBy: string | undefined;
}

export const resolveEventFormFieldError = (
  fieldErrors: Record<string, string> | undefined,
  candidates: readonly string[],
): EventFormFieldError => {
  const field = candidates.find((candidate) => fieldErrors?.[candidate]);
  if (!field)
    return { field: null, message: undefined, describedBy: undefined };
  return {
    field,
    message: fieldErrors?.[field],
    describedBy: eventFormErrorId(field),
  };
};

// Candidate field keys per control, in the order the form reports them.
export const TITLE_ERROR_FIELDS = ["content.title", "title"] as const;
export const SCHEDULE_ERROR_FIELDS = ["start", "end", "timeZone"] as const;
export const CALENDAR_ERROR_FIELDS = ["calendarId"] as const;
export const RECURRENCE_ERROR_FIELDS = ["recurrence"] as const;

// DOM / reading order in the form: title → schedule → recurrence → calendar.
export const FIELD_CONTROL_FOCUS_ORDER = [
  "content.title",
  "title",
  "start",
  "end",
  "timeZone",
  "recurrence",
  "calendarId",
] as const;

export const controlIdForFieldError = (field: string): string | null => {
  switch (field) {
    case "calendarId":
      return EVENT_FORM_CALENDAR_ID;
    case "start":
    case "end":
    case "timeZone":
      return EVENT_FORM_SCHEDULE_ID;
    case "recurrence":
      return EVENT_FORM_RECURRENCE_ID;
    case "content.title":
    case "title":
      return EVENT_FORM_TITLE_ID;
    default:
      return null;
  }
};

export const mapsUrlForLocation = (location: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
