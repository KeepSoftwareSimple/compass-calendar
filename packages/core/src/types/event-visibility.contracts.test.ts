import { type EventId, EventIdSchema } from "@core/types/domain-primitives";
import {
  HiddenEventIdsResponseSchema,
  SetEventHiddenInputSchema,
} from "@core/types/event-visibility.contracts";
import { describe, expect, it } from "bun:test";

const eventId = (value: string) => EventIdSchema.parse(value);

describe("HiddenEventIdsResponseSchema", () => {
  it("parses a valid response", () => {
    const parsed = HiddenEventIdsResponseSchema.parse({
      hiddenEventIds: [eventId("evt-1"), eventId("evt-2")],
    });

    expect(parsed).toEqual({
      hiddenEventIds: [eventId("evt-1"), eventId("evt-2")],
    });
  });

  it("accepts an empty list", () => {
    expect(
      HiddenEventIdsResponseSchema.safeParse({ hiddenEventIds: [] }).success,
    ).toBe(true);
  });

  it("accepts a composed occurrence id", () => {
    const occurrenceId = eventId("evt-1::2026-07-14T15:00:00.000Z");
    const parsed = HiddenEventIdsResponseSchema.parse({
      hiddenEventIds: [occurrenceId],
    });

    expect(parsed.hiddenEventIds).toEqual([occurrenceId]);
  });

  it("rejects an extra key", () => {
    expect(
      HiddenEventIdsResponseSchema.safeParse({
        hiddenEventIds: [eventId("evt-1")],
        extra: true,
      }).success,
    ).toBe(false);
  });

  it("rejects an empty eventId", () => {
    expect(
      HiddenEventIdsResponseSchema.safeParse({
        hiddenEventIds: ["" as EventId],
      }).success,
    ).toBe(false);
  });
});

describe("SetEventHiddenInputSchema", () => {
  it("parses a valid input", () => {
    const parsed = SetEventHiddenInputSchema.parse({
      eventId: eventId("evt-1"),
      hidden: true,
    });

    expect(parsed).toEqual({ eventId: eventId("evt-1"), hidden: true });
  });

  it("accepts a composed occurrence id", () => {
    const occurrenceId = eventId("evt-1::2026-07-14T15:00:00.000Z");
    const parsed = SetEventHiddenInputSchema.parse({
      eventId: occurrenceId,
      hidden: false,
    });

    expect(parsed).toEqual({ eventId: occurrenceId, hidden: false });
  });

  it("rejects an extra key", () => {
    expect(
      SetEventHiddenInputSchema.safeParse({
        eventId: eventId("evt-1"),
        hidden: true,
        extra: true,
      }).success,
    ).toBe(false);
  });

  it("rejects an empty eventId", () => {
    expect(
      SetEventHiddenInputSchema.safeParse({
        eventId: "" as EventId,
        hidden: true,
      }).success,
    ).toBe(false);
  });
});
