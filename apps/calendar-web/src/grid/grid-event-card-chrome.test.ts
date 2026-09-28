import { Origin } from "@core/constants/core.constants";
import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import { type GridEvent } from "@web/common/types/web.event.types";
import { assembleGridEvent } from "@web/common/utils/event/event.util";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { resolveGridEventCardChrome } from "@web/grid/grid-event-card-chrome";
import { describe, expect, it } from "bun:test";

const calendarId = CalendarIdSchema.parse(createObjectIdString());

const makeCalendar = (overrides: Partial<Calendar> = {}): Calendar => ({
  id: calendarId,
  name: "Work",
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
  accountEmail: "host@example.com",
  ...overrides,
});

const makeEvent = (overrides: Partial<GridEvent> = {}): GridEvent =>
  assembleGridEvent({
    _id: createObjectIdString(),
    title: "Sync",
    description: "",
    startDate: "2026-07-13T09:00:00.000-05:00",
    endDate: "2026-07-13T10:00:00.000-05:00",
    origin: Origin.COMPASS,
    isAllDay: false,
    user: "user-1",
    calendarId,
    organizer: { email: "host@example.com" },
    attendees: [
      { email: "host@example.com", responseStatus: "accepted" },
      { email: "guest@example.com", responseStatus: "needsAction" },
    ],
    ...overrides,
  });

describe("resolveGridEventCardChrome", () => {
  it("derives guestResponse from the lookup calendar accountEmail", () => {
    const lookup = new Map([[calendarId, makeCalendar()]]);
    const event = makeEvent();

    expect(
      resolveGridEventCardChrome(lookup, event, new Set()).guestResponse,
    ).toBe("awaiting");
  });

  it("returns null guestResponse when account email is absent", () => {
    const lookup = new Map([
      [calendarId, makeCalendar({ accountEmail: undefined })],
    ]);

    expect(
      resolveGridEventCardChrome(lookup, makeEvent(), new Set()).guestResponse,
    ).toBeNull();
  });
});
