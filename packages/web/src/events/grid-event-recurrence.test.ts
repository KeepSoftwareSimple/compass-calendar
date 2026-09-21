import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { gridRecurrenceFromEvent } from "@web/events/grid-event-recurrence";
import { describe, expect, test } from "bun:test";

describe("gridRecurrenceFromEvent", () => {
  test("projects a series master with a copied rule list", () => {
    const rules = ["RRULE:FREQ=WEEKLY"];
    const event = createMockEvent({
      recurrence: { kind: "series", rules },
    });

    expect(gridRecurrenceFromEvent(event)).toEqual({
      rule: rules,
      eventId: event.id,
    });
    expect(gridRecurrenceFromEvent(event)?.rule).not.toBe(rules);
  });

  test("projects an occurrence pointer, and hydrates rules when supplied", () => {
    const seriesId = createMockEvent().id;
    const event = createMockEvent({
      recurrence: { kind: "occurrence", seriesId },
    });
    const rules = ["RRULE:FREQ=DAILY;COUNT=3"];

    expect(gridRecurrenceFromEvent(event)).toEqual({ eventId: seriesId });
    expect(gridRecurrenceFromEvent(event, rules)).toEqual({
      eventId: seriesId,
      rule: rules,
    });
    expect(gridRecurrenceFromEvent(event, [])).toEqual({ eventId: seriesId });
  });

  test("omits recurrence for a single event", () => {
    expect(gridRecurrenceFromEvent(createMockEvent())).toBeUndefined();
  });
});
