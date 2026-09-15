import { EventScheduleSchema } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import {
  eventOnTargetDay,
  eventStartDay,
} from "@web/events/mutations/event-on-target-day";
import { expect, test } from "bun:test";

const timedMonday = createMockEvent({
  schedule: EventScheduleSchema.parse({
    kind: "timed",
    start: "2026-05-18T09:00:00.000Z",
    end: "2026-05-18T10:00:00.000Z",
    timeZone: "UTC",
  }),
});

const overnightMonday = createMockEvent({
  schedule: EventScheduleSchema.parse({
    kind: "timed",
    start: "2026-05-18T23:00:00.000Z",
    end: "2026-05-19T01:00:00.000Z",
    timeZone: "UTC",
  }),
});

const allDayMonday = createMockEvent({
  schedule: EventScheduleSchema.parse({
    kind: "allDay",
    start: "2026-05-18",
    end: "2026-05-19",
  }),
});

const multiDayAllDay = createMockEvent({
  schedule: EventScheduleSchema.parse({
    kind: "allDay",
    start: "2026-05-18",
    end: "2026-05-21",
  }),
});

test("returns the same event when the target is already the start day", () => {
  const thursday = dayjs("2026-05-18");
  expect(eventOnTargetDay(timedMonday, thursday)).toBe(timedMonday);
  expect(eventOnTargetDay(allDayMonday, thursday)).toBe(allDayMonday);
});

test("moves a timed event to the target day and keeps time of day and duration", () => {
  const moved = eventOnTargetDay(timedMonday, dayjs("2026-05-21"));

  expect(moved).not.toBe(timedMonday);
  expect(moved.schedule).toEqual({
    kind: "timed",
    start: "2026-05-21T09:00:00Z",
    end: "2026-05-21T10:00:00Z",
    timeZone: "UTC",
  });
  expect(eventStartDay(moved).format("YYYY-MM-DD")).toBe("2026-05-21");
});

test("keeps an overnight timed span when moving days", () => {
  const moved = eventOnTargetDay(overnightMonday, dayjs("2026-05-21"));

  expect(moved.schedule).toMatchObject({
    kind: "timed",
    start: "2026-05-21T23:00:00Z",
    end: "2026-05-22T01:00:00Z",
  });
});

test("moves an all-day event and keeps a one-day length", () => {
  const moved = eventOnTargetDay(allDayMonday, dayjs("2026-05-21"));

  expect(moved.schedule).toEqual({
    kind: "allDay",
    start: "2026-05-21",
    end: "2026-05-22",
  });
});

test("moves a multi-day all-day event and keeps its length", () => {
  const moved = eventOnTargetDay(multiDayAllDay, dayjs("2026-05-21"));

  expect(moved.schedule).toEqual({
    kind: "allDay",
    start: "2026-05-21",
    end: "2026-05-24",
  });
});
