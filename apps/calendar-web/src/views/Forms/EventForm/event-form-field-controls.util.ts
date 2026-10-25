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
