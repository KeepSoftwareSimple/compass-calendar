import { act } from "react";
import { getTimesLabel } from "@web/common/utils/datetime/web.date.util";
import {
  resetEffectiveTimeZoneStoreForTests,
  setPinnedTimeZone,
} from "@web/timezone/effective-timezone.store";
import { afterEach, describe, expect, it } from "bun:test";

const meridians = (label: string) =>
  (label.match(/am/gi) || label.match(/pm/gi) || []).length;

describe("Time Labels", () => {
  afterEach(() => {
    act(() => {
      resetEffectiveTimeZoneStoreForTests();
    });
  });
  it("removes minutes and am/pm when possible", () => {
    const morningLabel = getTimesLabel(
      "2022-07-06T06:00:00Z",
      "2022-07-06T07:00:00Z",
    );
    expect(meridians(morningLabel)).toBe(1);

    const eveningLabel = getTimesLabel(
      "2022-07-06T20:00:00Z",
      "2022-07-06T23:00:00Z",
    );
    expect(meridians(eveningLabel)).toBe(1);
  });

  // Counting meridiems missed that dropping the start's took its trailing
  // space with it, so every same-meridiem label - most of them - rendered as
  // "6  - 7 AM" on the card and in its aria-label. Assert the whole string.
  it("reads as one range when both ends share a meridiem", () => {
    expect(getTimesLabel("2022-07-06T06:00:00Z", "2022-07-06T07:00:00Z")).toBe(
      "6 - 7 AM",
    );
    expect(getTimesLabel("2022-07-06T10:45:00Z", "2022-07-06T11:00:00Z")).toBe(
      "10:45 - 11 AM",
    );
  });

  it("keeps both meridiems when the range crosses noon", () => {
    expect(getTimesLabel("2022-07-06T11:00:00Z", "2022-07-06T13:00:00Z")).toBe(
      "11 AM - 1 PM",
    );
  });

  it("preserves am/pm when needed", () => {
    const label = getTimesLabel("2022-07-06T01:00:00Z", "2022-07-06T18:00:00Z");
    expect(label.includes("AM")).toBe(true);
    expect(label.includes("PM")).toBe(true);
  });
  it("preserves minutes when needed", () => {
    const label = getTimesLabel("2022-07-06T09:45:00Z", "2022-07-06T19:15:00Z");
    expect(label.includes(":45")).toBe(true);
    expect(label.includes(":15")).toBe(true);
  });

  // Regression: an event synced from an external calendar in a different
  // timezone (e.g. a subscribed Berlin +02:00 calendar) used to have its
  // label re-pinned to the SOURCE offset instead of the viewer's local time,
  // even though the grid position was already correctly localized. CI runs
  // with TZ=Etc/UTC, so a +02:00 input should read 2 hours earlier here.
  it("localizes the label to the viewer's timezone, not the stored offset", () => {
    expect(
      getTimesLabel("2026-07-31T17:00:00+02:00", "2026-07-31T18:30:00+02:00"),
    ).toBe("3 - 4:30 PM");
  });

  it("localizes the label to a pinned calendar timezone", () => {
    act(() => {
      setPinnedTimeZone("America/Chicago");
    });

    expect(getTimesLabel("2022-07-06T06:00:00Z", "2022-07-06T07:00:00Z")).toBe(
      "1 - 2 AM",
    );
  });
});
