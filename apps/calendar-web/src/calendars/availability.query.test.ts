import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { deriveAvailabilityCalendarIds } from "./availability.query";
import { describe, expect, it } from "bun:test";

function makeCalendar(overrides: Partial<Calendar> = {}): Calendar {
  const access = overrides.access ?? "freeBusyReader";

  return {
    id: "507f1f77bcf86cd799439011" as Calendar["id"],
    name: "Cal",
    description: "",
    timeZone: null,
    foregroundColor: "#000000",
    backgroundColor: "#ffffff",
    provider: "google",
    access,
    capabilities: getCalendarCapabilities(access),
    isPrimary: false,
    isVisible: true,
    isActive: true,
    ...overrides,
  };
}

describe("deriveAvailabilityCalendarIds", () => {
  it("returns an empty array when calendars data hasn't loaded yet", () => {
    expect(deriveAvailabilityCalendarIds(undefined)).toEqual([]);
  });

  it("returns an empty array when there are no calendars", () => {
    expect(deriveAvailabilityCalendarIds([])).toEqual([]);
  });

  it("includes an active, visible freeBusyReader calendar", () => {
    const calendar = makeCalendar({
      id: "507f1f77bcf86cd799439012" as Calendar["id"],
    });

    expect(deriveAvailabilityCalendarIds([calendar])).toEqual([calendar.id]);
  });

  it("excludes a hidden freeBusyReader calendar", () => {
    const hidden = makeCalendar({
      id: "507f1f77bcf86cd799439013" as Calendar["id"],
      isVisible: false,
    });

    expect(deriveAvailabilityCalendarIds([hidden])).toEqual([]);
  });

  it("excludes an inactive freeBusyReader calendar", () => {
    const inactive = makeCalendar({
      id: "507f1f77bcf86cd799439014" as Calendar["id"],
      isActive: false,
    });

    expect(deriveAvailabilityCalendarIds([inactive])).toEqual([]);
  });

  it("excludes an event-capable (writer) calendar - its busy time already comes from synced events", () => {
    const writer = makeCalendar({
      id: "507f1f77bcf86cd799439015" as Calendar["id"],
      access: "writer",
      capabilities: getCalendarCapabilities("writer"),
    });

    expect(deriveAvailabilityCalendarIds([writer])).toEqual([]);
  });

  it("excludes an owner calendar and a reader calendar the same way", () => {
    const owner = makeCalendar({
      id: "507f1f77bcf86cd799439016" as Calendar["id"],
      access: "owner",
      capabilities: getCalendarCapabilities("owner"),
    });
    const reader = makeCalendar({
      id: "507f1f77bcf86cd799439017" as Calendar["id"],
      access: "reader",
      capabilities: getCalendarCapabilities("reader"),
    });

    expect(deriveAvailabilityCalendarIds([owner, reader])).toEqual([]);
  });

  it("picks only the qualifying calendars out of a visible/hidden/writer mix", () => {
    const qualifyingVisible = makeCalendar({
      id: "507f1f77bcf86cd799439018" as Calendar["id"],
    });
    const hiddenFreeBusy = makeCalendar({
      id: "507f1f77bcf86cd799439019" as Calendar["id"],
      isVisible: false,
    });
    const writer = makeCalendar({
      id: "507f1f77bcf86cd79943901a" as Calendar["id"],
      access: "writer",
      capabilities: getCalendarCapabilities("writer"),
    });

    expect(
      deriveAvailabilityCalendarIds([
        qualifyingVisible,
        hiddenFreeBusy,
        writer,
      ]),
    ).toEqual([qualifyingVisible.id]);
  });
});
