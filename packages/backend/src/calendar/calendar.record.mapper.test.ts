import { ObjectId } from "mongodb";
import {
  CalendarSchema,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { type CalendarId, type TimeZone } from "@core/types/domain-primitives";
import { type CalendarRecord } from "@backend/calendar/calendar.record";
import { mapCalendarRecord } from "@backend/calendar/calendar.record.mapper";
import { describe, expect, it } from "bun:test";

describe("mapCalendarRecord", () => {
  const buildRecord = (
    overrides: Partial<CalendarRecord> = {},
  ): CalendarRecord => ({
    _id: new ObjectId(),
    userId: new ObjectId(),
    name: "Work",
    description: "",
    timeZone: "America/Denver" as TimeZone,
    foregroundColor: "#ffffff",
    backgroundColor: "#5b6cff",
    access: "writer",
    isPrimary: false,
    isVisible: true,
    isActive: true,
    source: { provider: "google", calendarId: "gcal-1", etag: "etag-1" },
    createdAt: new Date(),
    updatedAt: null,
    ...overrides,
  });

  it("produces output that parses with CalendarSchema", () => {
    const record = buildRecord();
    const calendar = mapCalendarRecord(record);
    expect(() => CalendarSchema.parse(calendar)).not.toThrow();
    expect(calendar.id).toBe(record._id.toHexString() as CalendarId);
    expect(calendar.provider).toBe("google");
  });

  it("derives capabilities from the access role", () => {
    const record = buildRecord({ access: "freeBusyReader" });
    const calendar = mapCalendarRecord(record);
    expect(calendar.capabilities).toEqual(
      getCalendarCapabilities("freeBusyReader"),
    );
  });

  it("does not leak provider ids, etags, or userId", () => {
    const record = buildRecord();
    const calendar = mapCalendarRecord(record) as unknown as Record<
      string,
      unknown
    >;
    expect(calendar).not.toHaveProperty("userId");
    expect(calendar).not.toHaveProperty("source");
    expect(calendar).not.toHaveProperty("etag");
  });

  it("marks a local calendar as unable to mint Meet", () => {
    const calendar = mapCalendarRecord(
      buildRecord({ source: { provider: "local" } }),
    );
    expect(calendar.createsGoogleMeet).toBe(false);
    expect(calendar.conference).toBe("none");
  });

  it("marks a google-sourced calendar as Meet-capable by default", () => {
    const calendar = mapCalendarRecord(buildRecord());
    expect(calendar.createsGoogleMeet).toBe(true);
    expect(calendar.conference).toBe("meet");
  });
});
