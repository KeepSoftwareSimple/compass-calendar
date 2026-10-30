import {
  instanceOnLocalDay,
  scrubOverlapInstance,
} from "@scripts/commands/prod-overlap-export";
import { EventIdSchema } from "@core/types/domain-primitives";
import { EventScheduleSchema } from "@core/types/event.contracts";
import { describe, expect, it } from "bun:test";

const denver = "America/Denver";

describe("prod-overlap-export scrub", () => {
  it("keeps schedule and recurrence while redacting title to a label", () => {
    const instance = {
      eventId: EventIdSchema.parse("507f1f77bcf86cd799439011"),
      calendarId: "507f1f77bcf86cd799439099",
      content: {
        title: "Unwind with Tyler",
        description: "secret notes",
        location: "home",
        organizer: null,
        attendees: [],
        conference: null,
        colorHex: "#ff9900",
      },
      schedule: EventScheduleSchema.parse({
        kind: "timed",
        start: "2026-11-01T01:00:00.000Z",
        end: "2026-11-01T02:00:00.000Z",
        timeZone: denver,
      }),
      recurrence: {
        kind: "occurrence" as const,
        recurrenceId: "2026-11-01T01:00:00.000Z",
      },
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    };

    expect(scrubOverlapInstance(instance)).toEqual({
      eventId: instance.eventId,
      calendarId: instance.calendarId,
      label: "Unwind",
      schedule: instance.schedule,
      recurrence: instance.recurrence,
      colorHex: "#ff9900",
    });
  });

  it("includes timed instances overlapping the Denver day window", () => {
    const instance = {
      eventId: EventIdSchema.parse("507f1f77bcf86cd799439012"),
      calendarId: "cal",
      content: {
        title: "Monthly Ritual",
        description: "",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
      },
      schedule: EventScheduleSchema.parse({
        kind: "timed",
        start: "2026-11-01T01:00:00.000Z",
        end: "2026-11-01T02:30:00.000Z",
        timeZone: denver,
      }),
      recurrence: { kind: "single" as const },
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    };

    expect(instanceOnLocalDay(instance, "2026-10-31", denver)).toBe(true);
  });
});
