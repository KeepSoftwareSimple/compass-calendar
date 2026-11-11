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

  test.each(["this", "thisAndFollowing", "all"] as const)(
    "mergeReplaceInput keeps colorHex when replace sends color null (scope %s)",
    (scope) => {
      const seriesId = EventIdSchema.parse("bbbbbbbbbbbbbbbbbbbbbbbb");
      const existing = createMockEvent({
        id: EventIdSchema.parse("aaaaaaaaaaaaaaaaaaaaaaaa"),
        content: {
          kind: "details",
          title: "Devotion",
          description: "",
          colorHex: "#E67C73",
        },
        recurrence: { kind: "occurrence", seriesId },
      });
      const merged = mergeReplaceInput(existing, {
        content: {
          kind: "details",
          title: "Devotion",
          description: "",
          location: "",
          color: null,
        },
        schedule: existing.schedule,
        recurrence: { kind: "preserve" },
        scope,
      });
      expect(merged.content).toMatchObject({
        kind: "details",
        colorHex: "#E67C73",
      });
      expect(merged.content).not.toHaveProperty("color");
    },
  );

  test("mergeReplaceInput clears slot color when user sends color null", () => {
    const existing = createMockEvent({
      content: {
        kind: "details",
        title: "Devotion",
        description: "",
        color: "blue",
      },
    });
    const merged = mergeReplaceInput(existing, {
      content: {
        kind: "details",
        title: "Devotion",
        description: "",
        location: "",
        color: null,
      },
      schedule: existing.schedule,
      recurrence: { kind: "preserve" },
      scope: "this",
    });
    expect(merged.content).toMatchObject({ kind: "details" });
    expect(merged.content).not.toHaveProperty("color");
    expect(merged.content).not.toHaveProperty("colorHex");
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
