import {
  resetEffectiveTimeZoneStoreForTests,
  setBrowserTimeZoneForTests,
  setCalendarTimeZoneHint,
  setPinnedTimeZone,
} from "@web/timezone/effective-timezone.store";
import { eventFormScheduleTimeZoneHintText } from "@web/views/Forms/EventForm/DateControlsSection/DateTimeSection/event-form-schedule-timezone-hint.util";
import { afterEach, describe, expect, it } from "bun:test";

afterEach(() => {
  resetEffectiveTimeZoneStoreForTests();
});

describe("eventFormScheduleTimeZoneHintText", () => {
  it("shows Berlin wall time when the calendar is pinned to Denver", () => {
    setBrowserTimeZoneForTests("Etc/UTC");
    setCalendarTimeZoneHint("America/Denver");
    setPinnedTimeZone("America/Denver");

    const start = new Date("2026-10-31T18:00:00.000Z");
    const end = new Date("2026-10-31T19:30:00.000Z");
    expect(eventFormScheduleTimeZoneHintText("Europe/Berlin", start, end)).toBe(
      "7 - 8:30 PM Berlin",
    );
  });
});
