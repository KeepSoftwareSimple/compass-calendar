import {
  mergeDiscoveredBlockingCalendarIds,
  nextOptedOutBlockingCalendarIds,
} from "@core/booking/merge-blocking-calendars";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import { describe, expect, it } from "bun:test";

const id = (suffix: string) =>
  CalendarIdSchema.parse(`00000000000000000000000${suffix}`);

describe("mergeDiscoveredBlockingCalendarIds", () => {
  const google = id("1");
  const microsoft = id("2");
  const local = id("3");

  it("adds a calendar discovered after the page was saved", () => {
    expect(
      mergeDiscoveredBlockingCalendarIds({
        current: [google],
        optedOut: [],
        discovered: [google, microsoft],
      }),
    ).toEqual([google, microsoft]);
  });

  it("does not re-add a calendar the host opted out of", () => {
    expect(
      mergeDiscoveredBlockingCalendarIds({
        current: [google],
        optedOut: [microsoft],
        discovered: [google, microsoft, local],
      }),
    ).toEqual([google, local]);
  });

  it("does not duplicate calendars already blocking", () => {
    expect(
      mergeDiscoveredBlockingCalendarIds({
        current: [google, microsoft],
        optedOut: [],
        discovered: [microsoft, google],
      }),
    ).toEqual([google, microsoft]);
  });
});

describe("nextOptedOutBlockingCalendarIds", () => {
  const google = id("1");
  const microsoft = id("2");

  it("records eligible calendars the host left unchecked", () => {
    expect(
      nextOptedOutBlockingCalendarIds({
        previousOptedOut: [],
        eligible: [google, microsoft],
        submitted: [google],
      }),
    ).toEqual([microsoft]);
  });

  it("keeps an opt-out after the calendar reconnects", () => {
    expect(
      nextOptedOutBlockingCalendarIds({
        previousOptedOut: [microsoft],
        eligible: [google, microsoft],
        submitted: [google],
      }),
    ).toEqual([microsoft]);
  });

  it("clears an opt-out when the host adds the calendar back", () => {
    expect(
      nextOptedOutBlockingCalendarIds({
        previousOptedOut: [microsoft],
        eligible: [google, microsoft],
        submitted: [google, microsoft],
      }),
    ).toEqual([]);
  });
});
