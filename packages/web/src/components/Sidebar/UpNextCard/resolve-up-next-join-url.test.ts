import { EventIdSchema } from "@core/types/domain-primitives";
import { EventScheduleSchema } from "@core/types/event.contracts";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import {
  joinUrlFromDescription,
  resolveUpNextJoinUrl,
} from "@web/components/Sidebar/UpNextCard/resolve-up-next-join-url";
import { describe, expect, it } from "bun:test";

describe("joinUrlFromDescription", () => {
  it("reads an href from HTML descriptions", () => {
    expect(
      joinUrlFromDescription(
        'Join: <a href="https://zoom.us/j/123456789">Zoom</a>',
      ),
    ).toBe("https://zoom.us/j/123456789");
  });

  it("reads a bare URL from plain-text descriptions", () => {
    expect(
      joinUrlFromDescription("Dial in at https://meet.example.com/room."),
    ).toBe("https://meet.example.com/room");
  });
});

describe("resolveUpNextJoinUrl", () => {
  it("prefers the grid conference url", () => {
    const gridEvent = {
      _id: "abc",
      conference: { url: "https://meet.google.com/from-grid", label: null },
    } as Parameters<typeof resolveUpNextJoinUrl>[0];

    expect(resolveUpNextJoinUrl(gridEvent, undefined)).toBe(
      "https://meet.google.com/from-grid",
    );
  });

  it("falls back to the source event conference and description link", () => {
    const source = createMockEvent({
      id: EventIdSchema.parse("aaaaaaaaaaaaaaaaaaaaaaaa"),
      content: {
        kind: "details",
        title: "Standup",
        description:
          'Join <a href="https://zoom.us/j/999">Zoom</a> if you are early.',
        conference: null,
      },
      schedule: EventScheduleSchema.parse({
        kind: "timed",
        start: "2026-09-25T10:00:00.000Z",
        end: "2026-09-25T10:30:00.000Z",
        timeZone: "UTC",
      }),
    });

    expect(resolveUpNextJoinUrl(undefined, source)).toBe(
      "https://zoom.us/j/999",
    );
  });
});
