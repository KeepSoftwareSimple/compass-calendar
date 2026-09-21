import { EventScheduleSchema } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import {
  eventMatchesRange,
  normalizeEventList,
} from "@web/events/queries/event.query.normalize";
import { deriveCalendarEventViewModel } from "@web/events/queries/event.view-model";
import { WEEK_DAY_COUNT } from "@web/views/Week/util/week-window.util";
import { describe, expect, it } from "bun:test";

const DATE_FORMAT = dayjs.DateFormat.YEAR_MONTH_DAY_FORMAT;

const lastDayAllDay = () =>
  createMockEvent({
    schedule: EventScheduleSchema.parse({
      kind: "allDay",
      start: "2026-08-12",
      end: "2026-08-13",
    }),
  });

describe("eventMatchesRange", () => {
  it("includes a last-day all-day event when the range end is next midnight", () => {
    const start = dayjs("2026-08-06", DATE_FORMAT).startOf("day");
    const end = start.add(WEEK_DAY_COUNT, "day").startOf("day");

    expect(
      eventMatchesRange(lastDayAllDay(), start.format(), end.format()),
    ).toBe(true);
  });

  it("excludes a last-day all-day event when the range end is endOf(day)", () => {
    const start = dayjs("2026-08-06", DATE_FORMAT).startOf("day");
    const end = start.add(WEEK_DAY_COUNT - 1, "day").endOf("day");

    expect(
      eventMatchesRange(lastDayAllDay(), start.format(), end.format()),
    ).toBe(false);
  });
});

describe("normalizeEventList", () => {
  // The grid walks `ids` and looks each one up in `entities`, so an id listed
  // twice draws the same event twice: the duplicate all-day card a yearly
  // birthday showed while Google held only one event. Sources upstream can
  // legitimately name one event more than once (the backend concatenates every
  // page of a range read and sync appends a series base row per page), so the
  // list is de-duplicated here rather than at each caller.
  it("keeps one entry per id and renders the event once", () => {
    const duplicated = createMockEvent({
      schedule: EventScheduleSchema.parse({
        kind: "allDay",
        start: "2026-09-23",
        end: "2026-09-24",
      }),
      content: {
        kind: "details",
        title: "Johnny G's birthday",
        description: "",
      },
    });

    const data = normalizeEventList([duplicated, { ...duplicated }]);

    expect(data.ids).toEqual([duplicated.id]);
    expect(deriveCalendarEventViewModel(data).allDayEvents).toHaveLength(1);
  });

  it("keeps the first position of an id repeated later in the list", () => {
    const first = createMockEvent();
    const second = createMockEvent();

    expect(normalizeEventList([first, second, first]).ids).toEqual([
      first.id,
      second.id,
    ]);
  });
});
