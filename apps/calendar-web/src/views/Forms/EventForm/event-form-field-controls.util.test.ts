import {
  controlIdForFieldError,
  EVENT_FORM_CALENDAR_ID,
  EVENT_FORM_RECURRENCE_ID,
  EVENT_FORM_SCHEDULE_ID,
  EVENT_FORM_TITLE_ID,
  eventFormErrorId,
  FIELD_CONTROL_FOCUS_ORDER,
  mapsUrlForLocation,
} from "./event-form-field-controls.util";
import { describe, expect, test } from "bun:test";

describe("event-form-field-controls.util", () => {
  test("FIELD_CONTROL_FOCUS_ORDER matches save validation field order", () => {
    expect(FIELD_CONTROL_FOCUS_ORDER[0]).toBe("content.title");
    expect(FIELD_CONTROL_FOCUS_ORDER.at(-1)).toBe("calendarId");
  });

  test("controlIdForFieldError maps validation keys to stable control ids", () => {
    expect(controlIdForFieldError("calendarId")).toBe(EVENT_FORM_CALENDAR_ID);
    expect(controlIdForFieldError("start")).toBe(EVENT_FORM_SCHEDULE_ID);
    expect(controlIdForFieldError("recurrence")).toBe(EVENT_FORM_RECURRENCE_ID);
    expect(controlIdForFieldError("content.title")).toBe(EVENT_FORM_TITLE_ID);
    expect(controlIdForFieldError("attendees")).toBeNull();
  });

  test("eventFormErrorId normalizes dotted field paths", () => {
    expect(eventFormErrorId("content.title")).toBe(
      "event-form-error-content-title",
    );
  });

  test("mapsUrlForLocation encodes the query", () => {
    expect(mapsUrlForLocation("A & B")).toBe(
      "https://www.google.com/maps/search/?api=1&query=A%20%26%20B",
    );
  });
});
