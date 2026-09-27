import { faker } from "@faker-js/faker";
import { EventSchema } from "@core/types/event.contracts";
import { LocalEventRecordSchema } from "@web/events/types/local-event.record";

const validEvent = () => {
  const id = faker.database.mongodbObjectId();

  return EventSchema.parse({
    id,
    calendarId: faker.database.mongodbObjectId(),
    content: { kind: "details", title: "Standup", description: "" },
    schedule: {
      kind: "timed",
      start: "2026-07-14T09:00:00-06:00",
      end: "2026-07-14T10:00:00-06:00",
      timeZone: "America/Denver",
    },
    recurrence: { kind: "single" },
    createdAt: "2026-07-14T09:00:00-06:00",
    updatedAt: null,
  });
};

describe("LocalEventRecordSchema", () => {
  it("parses a valid record", () => {
    const event = validEvent();
    const result = LocalEventRecordSchema.safeParse({
      version: 2,
      id: event.id,
      event,
      isDemo: false,
    });

    expect(result.success).toBe(true);
  });

  it("rejects version 1", () => {
    const event = validEvent();
    const result = LocalEventRecordSchema.safeParse({
      version: 1,
      id: event.id,
      event,
      isDemo: false,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a top-level id that doesn't match event.id", () => {
    const event = validEvent();
    const otherEvent = validEvent();
    const result = LocalEventRecordSchema.safeParse({
      version: 2,
      id: otherEvent.id,
      event,
      isDemo: false,
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown keys", () => {
    const event = validEvent();
    const result = LocalEventRecordSchema.safeParse({
      version: 2,
      id: event.id,
      event,
      isDemo: false,
      extra: "nope",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a syncState key", () => {
    const event = validEvent();
    const result = LocalEventRecordSchema.safeParse({
      version: 2,
      id: event.id,
      event,
      isDemo: false,
      syncState: { status: "synced" },
    });

    expect(result.success).toBe(false);
  });
});
