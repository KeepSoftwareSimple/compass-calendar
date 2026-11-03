import { EventIdSchema } from "@core/types/domain-primitives";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import {
  mergeReplaceInput,
  optimisticGuestList,
  seriesIdOf,
  seriesWriteKey,
} from "./event-mutation-optimistic.util";
import { describe, expect, test } from "bun:test";

describe("event-mutation-optimistic.util", () => {
  test("seriesIdOf resolves occurrence and series bases", () => {
    const seriesId = EventIdSchema.parse("bbbbbbbbbbbbbbbbbbbbbbbb");
    const occurrence = createMockEvent({
      recurrence: { kind: "occurrence", seriesId },
    });
    const master = createMockEvent({
      id: seriesId,
      recurrence: { kind: "series", rules: ["RRULE:FREQ=DAILY"] },
    });
    expect(seriesIdOf(occurrence)).toBe(seriesId);
    expect(seriesIdOf(master)).toBe(seriesId);
    expect(seriesIdOf(createMockEvent())).toBeNull();
  });

  test("optimisticGuestList keeps RSVP for retained emails and needsAction for new guests", () => {
    const merged = optimisticGuestList(
      [
        { email: "kept@example.com", displayName: "Kept" },
        { email: "new@example.com", displayName: "New" },
      ],
      [
        {
          email: "kept@example.com",
          displayName: "Kept",
          responseStatus: "accepted",
        },
      ],
    );
    expect(merged).toEqual([
      {
        email: "kept@example.com",
        displayName: "Kept",
        responseStatus: "accepted",
      },
      {
        email: "new@example.com",
        displayName: "New",
        responseStatus: "needsAction",
      },
    ]);
  });

  test("mergeReplaceInput preserves recurrence on scope-this edits", () => {
    const existing = createMockEvent({
      recurrence: {
        kind: "occurrence",
        seriesId: EventIdSchema.parse("bbbbbbbbbbbbbbbbbbbbbbbb"),
      },
    });
    const merged = mergeReplaceInput(existing, {
      content: {
        kind: "details",
        title: "Renamed",
        description: "",
        location: "",
      },
      schedule: existing.schedule,
      recurrence: { kind: "preserve" },
      scope: "this",
    });
    expect(merged.recurrence).toEqual(existing.recurrence);
    expect(merged.content).toMatchObject({ title: "Renamed" });
  });

  test("seriesWriteKey collapses scope-all edits onto the root series id", () => {
    const seriesId = EventIdSchema.parse("bbbbbbbbbbbbbbbbbbbbbbbb");
    const occurrence = createMockEvent({
      id: EventIdSchema.parse("aaaaaaaaaaaaaaaaaaaaaaaa"),
      recurrence: { kind: "occurrence", seriesId },
    });
    expect(seriesWriteKey(occurrence, "all", occurrence.id)).toBe(
      EventIdSchema.parse(seriesId),
    );
    expect(seriesWriteKey(occurrence, "this", occurrence.id)).toBe(
      occurrence.id,
    );
  });
});
