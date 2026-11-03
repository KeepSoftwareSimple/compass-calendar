import {
  resetEffectiveTimeZoneStoreForTests,
  setBrowserTimeZoneForTests,
  setCalendarTimeZoneHint,
  setPinnedTimeZone,
} from "@web/timezone/effective-timezone.store";
import { getFormDatesForTimedInstants } from "@web/views/Forms/EventForm/DateControlsSection/DateTimeSection/form.datetime.util";
import { afterEach, describe, expect, it } from "bun:test";

afterEach(() => {
  resetEffectiveTimeZoneStoreForTests();
});

describe("getFormDatesForTimedInstants", () => {
  it("shows Denver wall clock for a Europe/Berlin event on Oct 31 (US still on MDT)", () => {
    setBrowserTimeZoneForTests("Etc/UTC");
    setCalendarTimeZoneHint("America/Denver");
    setPinnedTimeZone("America/Denver");

    const start = new Date("2026-10-31T18:00:00.000Z");
    const end = new Date("2026-10-31T19:30:00.000Z");
    const form = getFormDatesForTimedInstants(start, end);

    expect(form.startTime.label).toBe("12 PM");
    expect(form.endTime.label).toBe("1:30 PM");
  });

  it("labels the US fall-back Sunday in Denver when EU DST already ended", () => {
    setBrowserTimeZoneForTests("Etc/UTC");
    setCalendarTimeZoneHint("America/Denver");
    setPinnedTimeZone("America/Denver");

    const start = new Date("2026-11-01T17:00:00.000Z");
    const end = new Date("2026-11-01T18:30:00.000Z");
    const form = getFormDatesForTimedInstants(start, end);

    expect(form.startTime.label).toBe("10 AM");
    expect(form.endTime.label).toBe("11:30 AM");
  });
});
