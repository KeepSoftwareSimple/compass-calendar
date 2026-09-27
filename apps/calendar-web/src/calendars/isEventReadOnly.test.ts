import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import {
  markAccountReconnectRequired,
  resetGoogleReconnectRequiredForTests,
} from "@web/auth/providers/reconnect.state";
import {
  buildCalendarLookup,
  isEventReadOnly,
  isGridEventInteractionReadOnly,
  isGridEventScheduleLocked,
} from "@web/calendars/useCalendarLookup";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { afterEach, describe, expect, it } from "bun:test";

// Pure unit coverage for the shared read-only rule - the
// component-level tests (grid cards, shortcuts, context menu, form) each
// exercise this indirectly, but the rule itself is small enough to pin down
// directly: writable calendar -> false, unwritable -> true, busy content
// forces true regardless, and a lookup gap fails open.

const makeCalendar = (overrides: Partial<Calendar> = {}): Calendar => ({
  id: CalendarIdSchema.parse(createObjectIdString()),
  name: "Test calendar",
  description: "",
  timeZone: null,
  foregroundColor: "#000000",
  backgroundColor: "#3b82f6",
  provider: "google",
  access: "owner",
  capabilities: getCalendarCapabilities("owner"),
  isPrimary: false,
  isVisible: true,
  isActive: true,
  ...overrides,
});

describe("isEventReadOnly", () => {
  afterEach(() => {
    resetGoogleReconnectRequiredForTests();
  });

  it("is writable for an event on an owner calendar", () => {
    const calendar = makeCalendar({ access: "owner" });
    const lookup = buildCalendarLookup([calendar]);

    expect(isEventReadOnly(lookup, calendar.id, false)).toBe(false);
  });

  it("is read-only when the calendar's Google account needs reconnect", () => {
    const calendar = makeCalendar({
      access: "owner",
      accountEmail: "lance@example.com",
    });
    markAccountReconnectRequired({
      connectionId: "conn-1",
      accountEmail: "lance@example.com",
      provider: "google",
    });
    const lookup = buildCalendarLookup([calendar]);

    expect(isEventReadOnly(lookup, calendar.id, false)).toBe(true);
  });

  it("is writable for an event on a writer calendar", () => {
    const calendar = makeCalendar({
      access: "writer",
      capabilities: getCalendarCapabilities("writer"),
    });
    const lookup = buildCalendarLookup([calendar]);

    expect(isEventReadOnly(lookup, calendar.id, false)).toBe(false);
  });

  it("is read-only for an event on a reader calendar", () => {
    const calendar = makeCalendar({
      access: "reader",
      capabilities: getCalendarCapabilities("reader"),
    });
    const lookup = buildCalendarLookup([calendar]);

    expect(isEventReadOnly(lookup, calendar.id, false)).toBe(true);
  });

  it("is read-only for an event on a freeBusyReader calendar", () => {
    const calendar = makeCalendar({
      access: "freeBusyReader",
      capabilities: getCalendarCapabilities("freeBusyReader"),
    });
    const lookup = buildCalendarLookup([calendar]);

    expect(isEventReadOnly(lookup, calendar.id, false)).toBe(true);
  });

  it("forces read-only for busy content regardless of calendar capability", () => {
    const calendar = makeCalendar({ access: "owner" });
    const lookup = buildCalendarLookup([calendar]);

    expect(isEventReadOnly(lookup, calendar.id, true)).toBe(true);
  });

  it("fails open (writable) when the calendarId is missing", () => {
    const lookup = buildCalendarLookup([makeCalendar()]);

    expect(isEventReadOnly(lookup, undefined, false)).toBe(false);
    expect(isEventReadOnly(lookup, null, false)).toBe(false);
  });

  it("fails open (writable) when the calendarId doesn't resolve in the lookup", () => {
    const lookup = buildCalendarLookup([makeCalendar()]);
    const unknownId = CalendarIdSchema.parse(createObjectIdString());

    expect(isEventReadOnly(lookup, unknownId, false)).toBe(false);
  });

  it("fails open (writable) when the calendars query hasn't loaded yet", () => {
    const lookup = buildCalendarLookup(undefined);
    const someId = CalendarIdSchema.parse(createObjectIdString());

    expect(isEventReadOnly(lookup, someId, false)).toBe(false);
  });
});

describe("isGridEventInteractionReadOnly", () => {
  it("treats busy and timed multi-day display content as read-only", () => {
    const calendar = makeCalendar({ access: "owner" });
    const lookup = buildCalendarLookup([calendar]);

    expect(
      isGridEventInteractionReadOnly(lookup, {
        calendarId: calendar.id,
        isBusy: true,
      }),
    ).toBe(true);
    expect(
      isGridEventInteractionReadOnly(lookup, {
        calendarId: calendar.id,
        isTimedMultiDayDisplay: true,
      }),
    ).toBe(true);
  });

  it("still respects calendar write capability for ordinary events", () => {
    const reader = makeCalendar({
      access: "reader",
      capabilities: getCalendarCapabilities("reader"),
    });
    const owner = makeCalendar({ access: "owner" });
    const lookup = buildCalendarLookup([reader, owner]);

    expect(
      isGridEventInteractionReadOnly(lookup, { calendarId: reader.id }),
    ).toBe(true);
    expect(
      isGridEventInteractionReadOnly(lookup, { calendarId: owner.id }),
    ).toBe(false);
  });
});

describe("isGridEventScheduleLocked", () => {
  it("is true for provider-managed events on a writable calendar", () => {
    const calendar = makeCalendar({ access: "owner" });
    const lookup = buildCalendarLookup([calendar]);

    expect(
      isGridEventScheduleLocked(lookup, {
        calendarId: calendar.id,
        isProviderManaged: true,
      }),
    ).toBe(true);
  });

  it("is false for a normal writable-calendar event", () => {
    const calendar = makeCalendar({ access: "owner" });
    const lookup = buildCalendarLookup([calendar]);

    expect(isGridEventScheduleLocked(lookup, { calendarId: calendar.id })).toBe(
      false,
    );
  });

  it("leaves isEventReadOnly unchanged for provider-managed events", () => {
    const calendar = makeCalendar({ access: "owner" });
    const lookup = buildCalendarLookup([calendar]);

    expect(isEventReadOnly(lookup, calendar.id, false)).toBe(false);
  });
});
