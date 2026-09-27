import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { getDayViewCalendars } from "./dayCalendarColumns.util";
import { describe, expect, it } from "bun:test";

function makeCalendar(overrides: Partial<Calendar>): Calendar {
  return {
    id: "507f1f77bcf86cd799439011" as Calendar["id"],
    name: "Cal",
    description: "",
    timeZone: null,
    foregroundColor: "#000000",
    backgroundColor: "#ffffff",
    provider: "local",
    access: "owner",
    capabilities: {
      ...getCalendarCapabilities("owner"),
      canManage: false,
      canWatchEvents: false,
      canInviteAttendees: false,
    },
    isPrimary: false,
    isVisible: true,
    isActive: true,
    ...overrides,
  };
}

describe("getDayViewCalendars", () => {
  it("keeps the local calendar when it is active and visible", () => {
    const local = makeCalendar({ provider: "local", name: "Compass" });
    const google = makeCalendar({
      provider: "google",
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
      name: "primary",
    });

    expect(getDayViewCalendars([local, google])).toEqual([local, google]);
  });

  it("falls back to the primary calendar when none are visible", () => {
    const local = makeCalendar({
      provider: "local",
      name: "Compass",
      isVisible: false,
    });
    const primaryGoogle = makeCalendar({
      provider: "google",
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
      name: "primary",
      isPrimary: true,
      isVisible: false,
    });
    const secondaryGoogle = makeCalendar({
      provider: "google",
      id: "507f1f77bcf86cd799439013" as Calendar["id"],
      name: "secondary",
      isVisible: false,
    });

    expect(
      getDayViewCalendars([local, secondaryGoogle, primaryGoogle]),
    ).toEqual([primaryGoogle]);
  });

  it("includes a visible local column alongside Google calendars", () => {
    const local = makeCalendar({
      provider: "local",
      name: "Compass",
      isPrimary: true,
    });
    const google = makeCalendar({
      provider: "google",
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
      name: "primary",
    });

    expect(getDayViewCalendars([local, google])).toEqual([local, google]);
  });
});
