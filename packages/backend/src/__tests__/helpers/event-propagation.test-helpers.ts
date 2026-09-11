import { ObjectId } from "mongodb";
import { type TimeZone } from "@core/types/domain-primitives";
import {
  type CalendarRecord,
  CalendarRecordSchema,
} from "@backend/calendar/calendar.record";
import mongoService from "@backend/common/services/mongo.service";
import { type EventRecord } from "@backend/event/event.record";

/**
 * Test conventions shared by the compass->google propagation suites: real
 * mongo-memory-server, EventRecord/CalendarRecord shapes seeded directly, no
 * ORM. Google network calls never happen because the backend no longer has a
 * Google Calendar API-client code path to call (removed once Sync took over
 * event/calendar sync duties).
 */

export type GoogleCalendarRecord = CalendarRecord & {
  source: { provider: "google"; calendarId: string; etag: string };
};

export const seedGoogleCalendar = async (
  userId: ObjectId,
  overrides: Partial<CalendarRecord> = {},
): Promise<GoogleCalendarRecord> => {
  const record = CalendarRecordSchema.parse({
    _id: new ObjectId(),
    userId,
    name: "Work",
    description: "",
    timeZone: "America/Denver",
    foregroundColor: "#000000",
    backgroundColor: "#ffffff",
    access: "owner",
    isPrimary: true,
    isVisible: true,
    isActive: true,
    source: {
      provider: "google",
      calendarId: `gcal-${new ObjectId().toHexString()}`,
      etag: "etag-1",
    },
    createdAt: new Date(),
    updatedAt: null,
    ...overrides,
  }) as GoogleCalendarRecord;
  await mongoService.calendar.insertOne(record);
  return record;
};

export const buildEventRecord = (
  calendarId: ObjectId,
  overrides: Partial<EventRecord> = {},
): EventRecord => ({
  _id: new ObjectId(),
  calendarId,
  content: { kind: "details", title: "Standup", description: "" },
  schedule: {
    kind: "timed",
    start: new Date("2026-07-14T15:00:00.000Z"),
    end: new Date("2026-07-14T16:00:00.000Z"),
    timeZone: "America/Denver" as TimeZone,
  },
  recurrence: { kind: "single" },
  externalReference: null,
  createdAt: new Date(),
  updatedAt: null,
  ...overrides,
});
