import { EventScheduleSchema } from "@core/types/event.contracts";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { formatEventClipboardText } from "@web/events/event-clipboard-text.util";
import { describe, expect, it } from "bun:test";

describe("formatEventClipboardText", () => {
  it("formats timed events with title and range", () => {
    const event = createMockEvent({
      content: { kind: "details", title: "Standup", description: "" },
      schedule: EventScheduleSchema.parse({
        kind: "timed",
        start: "2026-05-20T15:00:00.000Z",
        end: "2026-05-20T15:30:00.000Z",
        timeZone: "UTC",
      }),
    });
    const text = formatEventClipboardText(event);
    expect(text).toContain("Standup");
    expect(text).toContain("UTC");
  });

  it("formats all-day events", () => {
    const event = createMockEvent({
      content: { kind: "details", title: "Away", description: "" },
      schedule: EventScheduleSchema.parse({
        kind: "allDay",
        start: "2026-05-20",
        end: "2026-05-22",
      }),
    });
    const text = formatEventClipboardText(event);
    expect(text).toContain("Away");
    expect(text).toContain("All day");
  });
});
