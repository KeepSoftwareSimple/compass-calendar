import {
  type CalendarId,
  CalendarIdSchema,
  DateTimeSchema,
  EventIdSchema,
} from "@core/types/domain-primitives";
import { type Event, EventScheduleSchema } from "@core/types/event.contracts";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { type LocalEventRecord } from "@web/events/types/local-event.record";

const DEFAULT_CALENDAR_ID: CalendarId = CalendarIdSchema.parse(
  createObjectIdString(),
);

const DEFAULT_TIMED_SCHEDULE = EventScheduleSchema.parse({
  kind: "timed",
  start: "2026-05-05T09:00:00.000-05:00",
  end: "2026-05-05T10:00:00.000-05:00",
  timeZone: "America/Chicago",
});

export function createMockEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: EventIdSchema.parse(createObjectIdString()),
    calendarId: DEFAULT_CALENDAR_ID,
    content: { kind: "details", title: "Test Event", description: "" },
    schedule: DEFAULT_TIMED_SCHEDULE,
    recurrence: { kind: "single" },
    createdAt: DateTimeSchema.parse("2026-05-01T00:00:00.000Z"),
    updatedAt: null,
    ...overrides,
  };
}

export function createMockLocalEventRecord(
  overrides: Partial<Event> = {},
  isDemo = false,
): LocalEventRecord {
  const event = createMockEvent(overrides);
  return { version: 2, id: event.id, event, isDemo };
}
