import {
  DateOnlySchema,
  type EventId,
  TimeZoneSchema,
} from "@core/types/domain-primitives";
import dayjs from "@core/util/date/dayjs";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import {
  projectRecurringDelete,
  projectRecurringEdit,
  projectSeriesMaterialization,
} from "./projectRecurringEdit";
import { describe, expect, test } from "bun:test";

const SERIES_ID = "664e21f9a6b3f0b1c2d3e4f5" as EventId;

const occurrence = (day: number) =>
  createMockEvent({
    content: { kind: "details", title: "Original", description: "" },
    schedule: {
      kind: "timed",
      start: `2026-07-${String(day).padStart(2, "0")}T16:00:00.000Z`,
      end: `2026-07-${String(day).padStart(2, "0")}T17:00:00.000Z`,
      timeZone: "UTC",
    } as never,
    recurrence: { kind: "occurrence", seriesId: SERIES_ID },
  });

const allDayOccurrence = (day: number) =>
  createMockEvent({
    content: { kind: "details", title: "Original", description: "" },
    schedule: {
      kind: "allDay",
      start: `2026-07-${String(day).padStart(2, "0")}`,
      end: `2026-07-${String(day + 1).padStart(2, "0")}`,
    } as never,
    recurrence: { kind: "occurrence", seriesId: SERIES_ID },
  });

const seriesBase = () =>
  createMockEvent({
    id: SERIES_ID,
    content: { kind: "details", title: "Original", description: "" },
    schedule: {
      kind: "timed",
      start: "2026-07-01T16:00:00.000Z",
      end: "2026-07-01T17:00:00.000Z",
      timeZone: "UTC",
    } as never,
    recurrence: { kind: "series", rules: ["RRULE:FREQ=DAILY"] },
  });

describe("projectRecurringEdit", () => {
  test("patches every cached occurrence for all-events edits", () => {
    const events = [occurrence(1), occurrence(2)];
    const edited = {
      ...events[1],
      content: { kind: "details" as const, title: "Updated", description: "" },
    };

    const result = projectRecurringEdit({
      scope: "all",
      edited,
      original: events[1],
      seriesEvents: events,
    });

    expect(
      result.upserts.map(({ id, content }) => ({
        id,
        title: content.kind === "details" ? content.title : null,
      })),
    ).toEqual([
      { id: events[0].id, title: "Updated" },
      { id: events[1].id, title: "Updated" },
    ]);
    // A title-only edit has no time delta, so every occurrence keeps its time.
    expect(
      result.upserts.map((event) =>
        event.schedule.kind === "timed"
          ? dayjs(event.schedule.start).toISOString()
          : null,
      ),
    ).toEqual(
      events.map((event) =>
        event.schedule.kind === "timed"
          ? dayjs(event.schedule.start).toISOString()
          : null,
      ),
    );
  });

  test("shifts every occurrence when an all-events edit moves the time", () => {
    const events = [occurrence(1), occurrence(2), occurrence(3)];
    // Drag the second instance two hours later (and lengthen it by 30 min).
    const original = events[1];
    const edited = {
      ...original,
      schedule: {
        kind: "timed" as const,
        start: "2026-07-02T18:00:00.000Z",
        end: "2026-07-02T19:30:00.000Z",
        timeZone: "UTC",
      } as never,
    };

    const result = projectRecurringEdit({
      scope: "all",
      edited,
      original,
      seriesEvents: events,
    });

    // Every instance — including ones before the dragged one — moves by the
    // same delta, so the whole series re-renders at the new time immediately.
    expect(
      result.upserts.map((event) => ({
        id: event.id,
        ...(event.schedule.kind === "timed"
          ? {
              start: event.schedule.start as string,
              end: event.schedule.end as string,
            }
          : {}),
      })),
    ).toEqual([
      {
        id: events[0].id,
        start: "2026-07-01T18:00:00+00:00",
        end: "2026-07-01T19:30:00+00:00",
      },
      {
        id: events[1].id,
        start: "2026-07-02T18:00:00.000Z",
        end: "2026-07-02T19:30:00.000Z",
      },
      {
        id: events[2].id,
        start: "2026-07-03T18:00:00+00:00",
        end: "2026-07-03T19:30:00+00:00",
      },
    ]);
  });

  test("patches and shifts only the cutoff and future occurrences", () => {
    const events = [occurrence(1), occurrence(2), occurrence(3)];
    const original = events[1];
    const edited = {
      ...original,
      content: {
        kind: "details" as const,
        title: "Following",
        description: "",
      },
      schedule: {
        kind: "timed" as const,
        start: "2026-07-03T18:00:00.000Z",
        end: "2026-07-03T19:30:00.000Z",
        timeZone: "UTC",
      } as never,
    };

    const result = projectRecurringEdit({
      scope: "thisAndFollowing",
      edited,
      original,
      seriesEvents: events,
    });

    expect(
      result.upserts.map((event) => ({
        id: event.id,
        ...(event.schedule.kind === "timed"
          ? {
              start: event.schedule.start as string,
              end: event.schedule.end as string,
            }
          : {}),
      })),
    ).toEqual([
      {
        id: events[1].id,
        start: "2026-07-03T18:00:00.000Z",
        end: "2026-07-03T19:30:00.000Z",
      },
      {
        id: events[2].id,
        start: "2026-07-04T18:00:00+00:00",
        end: "2026-07-04T19:30:00+00:00",
      },
    ]);
  });

  test("collapses an all-events recurrence removal to the edited event", () => {
    const events = [occurrence(1), occurrence(2)];
    const edited = { ...events[1], recurrence: { kind: "single" as const } };

    const result = projectRecurringEdit({
      scope: "all",
      edited,
      original: events[1],
      seriesEvents: events,
    });

    expect([...result.removeIds]).toEqual([events[0].id]);
    expect(result.upserts).toEqual([edited]);
  });

  test("converts every occurrence to all-day for an all-events kind flip", () => {
    const events = [occurrence(1), occurrence(2), occurrence(3)];
    const original = events[1];
    const edited = {
      ...original,
      schedule: {
        kind: "allDay" as const,
        start: "2026-07-02",
        end: "2026-07-03",
      } as never,
    };

    const result = projectRecurringEdit({
      scope: "all",
      edited,
      original,
      seriesEvents: events,
    });

    expect(
      result.upserts.map((event) => ({
        id: event.id,
        schedule: event.schedule,
      })),
    ).toEqual([
      {
        id: events[0].id,
        schedule: {
          kind: "allDay",
          start: DateOnlySchema.parse("2026-07-01"),
          end: DateOnlySchema.parse("2026-07-02"),
        },
      },
      {
        id: events[1].id,
        schedule: {
          kind: "allDay",
          start: DateOnlySchema.parse("2026-07-02"),
          end: DateOnlySchema.parse("2026-07-03"),
        },
      },
      {
        id: events[2].id,
        schedule: {
          kind: "allDay",
          start: DateOnlySchema.parse("2026-07-03"),
          end: DateOnlySchema.parse("2026-07-04"),
        },
      },
    ]);
  });

  test("converts only the cutoff and future occurrences to all-day", () => {
    const events = [occurrence(1), occurrence(2), occurrence(3)];
    const original = events[1];
    const edited = {
      ...original,
      schedule: {
        kind: "allDay" as const,
        start: "2026-07-02",
        end: "2026-07-03",
      } as never,
    };

    const result = projectRecurringEdit({
      scope: "thisAndFollowing",
      edited,
      original,
      seriesEvents: events,
    });

    expect(
      result.upserts.map((event) => ({
        id: event.id,
        schedule: event.schedule,
      })),
    ).toEqual([
      {
        id: events[1].id,
        schedule: {
          kind: "allDay",
          start: DateOnlySchema.parse("2026-07-02"),
          end: DateOnlySchema.parse("2026-07-03"),
        },
      },
      {
        id: events[2].id,
        schedule: {
          kind: "allDay",
          start: DateOnlySchema.parse("2026-07-03"),
          end: DateOnlySchema.parse("2026-07-04"),
        },
      },
    ]);
  });

  test("converts every occurrence to timed for an all-events all-day to timed flip", () => {
    const events = [
      allDayOccurrence(1),
      allDayOccurrence(2),
      allDayOccurrence(3),
    ];
    const original = events[1];
    const edited = {
      ...original,
      schedule: {
        kind: "timed" as const,
        start: "2026-07-02T16:00:00.000Z",
        end: "2026-07-02T17:00:00.000Z",
        timeZone: "UTC",
      } as never,
    };

    const result = projectRecurringEdit({
      scope: "all",
      edited,
      original,
      seriesEvents: events,
    });

    expect(
      result.upserts.map((event) => ({
        id: event.id,
        ...(event.schedule.kind === "timed"
          ? {
              start: dayjs(event.schedule.start).toISOString(),
              end: dayjs(event.schedule.end).toISOString(),
              timeZone: event.schedule.timeZone,
            }
          : {}),
      })),
    ).toEqual([
      {
        id: events[0].id,
        start: "2026-07-01T16:00:00.000Z",
        end: "2026-07-01T17:00:00.000Z",
        timeZone: TimeZoneSchema.parse("UTC"),
      },
      {
        id: events[1].id,
        start: "2026-07-02T16:00:00.000Z",
        end: "2026-07-02T17:00:00.000Z",
        timeZone: TimeZoneSchema.parse("UTC"),
      },
      {
        id: events[2].id,
        start: "2026-07-03T16:00:00.000Z",
        end: "2026-07-03T17:00:00.000Z",
        timeZone: TimeZoneSchema.parse("UTC"),
      },
    ]);
  });

  test("preserves wall-clock time when all-day to timed crosses a DST spring-forward", () => {
    // 2026-03-08 is the America/Denver spring-forward (02:00 → 03:00).
    const events = [
      createMockEvent({
        content: { kind: "details", title: "Original", description: "" },
        schedule: {
          kind: "allDay",
          start: "2026-03-07",
          end: "2026-03-08",
        } as never,
        recurrence: { kind: "occurrence", seriesId: SERIES_ID },
      }),
      createMockEvent({
        content: { kind: "details", title: "Original", description: "" },
        schedule: {
          kind: "allDay",
          start: "2026-03-08",
          end: "2026-03-09",
        } as never,
        recurrence: { kind: "occurrence", seriesId: SERIES_ID },
      }),
    ];
    const original = events[0];
    const edited = {
      ...original,
      schedule: {
        kind: "timed" as const,
        start: "2026-03-07T15:00:00-07:00",
        end: "2026-03-07T16:00:00-07:00",
        timeZone: "America/Denver",
      } as never,
    };

    const result = projectRecurringEdit({
      scope: "all",
      edited,
      original,
      seriesEvents: events,
    });

    const starts = result.upserts.map((event) =>
      event.schedule.kind === "timed"
        ? dayjs(event.schedule.start)
            .tz("America/Denver")
            .format("YYYY-MM-DD HH:mm")
        : null,
    );
    expect(starts).toEqual(["2026-03-07 15:00", "2026-03-08 15:00"]);
  });

  test("does not double-shift an already-moved instance on an all-events promote", () => {
    const events = [occurrence(1), occurrence(2), occurrence(3)];
    const original = events[1];
    // Four days later: still inside a typical Jul 1–8 week window. Shifting
    // again would land on 2026-07-10, which that week query would drop.
    const edited = {
      ...original,
      content: { kind: "details" as const, title: "Moved", description: "" },
      schedule: {
        kind: "timed" as const,
        start: "2026-07-06T16:00:00.000Z",
        end: "2026-07-06T17:00:00.000Z",
        timeZone: "UTC",
      } as never,
    };
    const seriesEvents = [events[0], edited, events[2]];

    const result = projectRecurringEdit({
      scope: "all",
      edited,
      original,
      seriesEvents,
    });

    expect(
      result.upserts.map((event) => ({
        id: event.id,
        ...(event.schedule.kind === "timed"
          ? {
              start: event.schedule.start as string,
              end: event.schedule.end as string,
            }
          : {}),
        title: event.content.kind === "details" ? event.content.title : null,
      })),
    ).toEqual([
      {
        id: events[0].id,
        start: "2026-07-05T16:00:00+00:00",
        end: "2026-07-05T17:00:00+00:00",
        title: "Moved",
      },
      {
        id: events[1].id,
        start: "2026-07-06T16:00:00.000Z",
        end: "2026-07-06T17:00:00.000Z",
        title: "Moved",
      },
      {
        id: events[2].id,
        start: "2026-07-07T16:00:00+00:00",
        end: "2026-07-07T17:00:00+00:00",
        title: "Moved",
      },
    ]);
  });

  test("does not double-shift an already-moved instance on a this-and-following promote", () => {
    const events = [occurrence(1), occurrence(2), occurrence(3)];
    const original = events[1];
    const edited = {
      ...original,
      schedule: {
        kind: "timed" as const,
        start: "2026-07-06T16:00:00.000Z",
        end: "2026-07-06T17:00:00.000Z",
        timeZone: "UTC",
      } as never,
    };
    const seriesEvents = [events[0], edited, events[2]];

    const result = projectRecurringEdit({
      scope: "thisAndFollowing",
      edited,
      original,
      seriesEvents,
    });

    expect(
      result.upserts.map((event) => ({
        id: event.id,
        ...(event.schedule.kind === "timed"
          ? {
              start: event.schedule.start as string,
              end: event.schedule.end as string,
            }
          : {}),
      })),
    ).toEqual([
      {
        id: events[1].id,
        start: "2026-07-06T16:00:00.000Z",
        end: "2026-07-06T17:00:00.000Z",
      },
      {
        id: events[2].id,
        start: "2026-07-07T16:00:00+00:00",
        end: "2026-07-07T17:00:00+00:00",
      },
    ]);
  });

  test("keeps an already-moved-earlier instance in a this-and-following promote", () => {
    const events = [occurrence(1), occurrence(2), occurrence(3)];
    const original = events[2];
    const edited = {
      ...original,
      schedule: {
        kind: "timed" as const,
        start: "2026-07-02T16:00:00.000Z",
        end: "2026-07-02T17:00:00.000Z",
        timeZone: "UTC",
      } as never,
    };
    const seriesEvents = [events[0], events[1], edited];

    const result = projectRecurringEdit({
      scope: "thisAndFollowing",
      edited,
      original,
      seriesEvents,
    });

    expect(
      result.upserts.map((event) => ({
        id: event.id,
        ...(event.schedule.kind === "timed"
          ? { start: event.schedule.start as string }
          : {}),
      })),
    ).toEqual([
      {
        id: events[2].id,
        start: "2026-07-02T16:00:00.000Z",
      },
    ]);
  });
});

describe("projectRecurringDelete", () => {
  test("removes every occurrence and the series base for an all-events delete", () => {
    const events = [occurrence(1), occurrence(2), occurrence(3)];
    const target = events[1];

    const result = projectRecurringDelete({
      scope: "all",
      target,
      seriesId: SERIES_ID,
      seriesEvents: events,
    });

    expect([...result.removeIds].sort()).toEqual(
      [...events.map((event) => event.id), SERIES_ID].sort(),
    );
    expect(result.upserts).toEqual([]);
  });

  test("keeps earlier occurrences and the series base for a this-and-following delete", () => {
    const events = [occurrence(1), occurrence(2), occurrence(3)];
    const target = events[1];

    const result = projectRecurringDelete({
      scope: "thisAndFollowing",
      target,
      seriesId: SERIES_ID,
      seriesEvents: events,
    });

    expect([...result.removeIds].sort()).toEqual(
      [events[1].id, events[2].id].sort(),
    );
    expect(result.removeIds.has(events[0].id)).toBe(false);
    expect(result.removeIds.has(SERIES_ID)).toBe(false);
  });

  test("removes every occurrence when an all-events delete is clicked on the series base", () => {
    const base = seriesBase();
    const events = [occurrence(1), occurrence(2)];

    const result = projectRecurringDelete({
      scope: "all",
      target: base,
      seriesId: SERIES_ID,
      seriesEvents: events,
    });

    expect([...result.removeIds].sort()).toEqual(
      [...events.map((event) => event.id), SERIES_ID].sort(),
    );
  });
});

describe("projectSeriesMaterialization", () => {
  const dailyBase = (rules = ["RRULE:FREQ=DAILY;COUNT=10"]) =>
    createMockEvent({
      id: SERIES_ID,
      content: { kind: "details", title: "Standup", description: "" },
      schedule: {
        kind: "timed",
        start: "2026-07-06T16:00:00.000Z",
        end: "2026-07-06T17:00:00.000Z",
        timeZone: "UTC",
      } as never,
      recurrence: { kind: "series", rules },
    });

  const weekRange = {
    start: "2026-07-05T00:00:00.000Z",
    end: "2026-07-12T00:00:00.000Z",
  };

  test("expands a daily rule into occurrence instances including the first day", async () => {
    const base = dailyBase();

    const result = await projectSeriesMaterialization({
      base,
      ranges: [weekRange],
    });

    expect(result.upserts[0]).toBe(base);
    const instances = result.upserts.slice(1);
    expect(instances.length).toBeGreaterThanOrEqual(6);
    for (const instance of instances) {
      expect(instance.recurrence).toEqual({
        kind: "occurrence",
        seriesId: SERIES_ID,
      });
      expect(instance.id).toContain(`${SERIES_ID}::`);
    }
    const starts = instances.map((instance) =>
      dayjs(instance.schedule.start).toISOString(),
    );
    expect(starts[0]).toBe("2026-07-06T16:00:00.000Z");
    expect(starts[1]).toBe("2026-07-07T16:00:00.000Z");
  });

  test("is deterministic: same input yields the same instance ids", async () => {
    const base = dailyBase();

    const first = await projectSeriesMaterialization({
      base,
      ranges: [weekRange],
    });
    const second = await projectSeriesMaterialization({
      base,
      ranges: [weekRange],
    });

    expect(first.upserts.map(({ id }) => id)).toEqual(
      second.upserts.map(({ id }) => id),
    );
  });

  test("marks stale cached instances for removal", async () => {
    const base = dailyBase(["RRULE:FREQ=WEEKLY;COUNT=4"]);
    const stale = [occurrence(1), occurrence(2)];

    const result = await projectSeriesMaterialization({
      base,
      cachedSeriesEvents: stale,
      ranges: [weekRange],
    });

    expect([...result.removeIds].sort()).toEqual(
      stale.map(({ id }) => id).sort(),
    );
  });

  test("returns only the base when there are no ranges", async () => {
    const base = dailyBase();

    const result = await projectSeriesMaterialization({ base, ranges: [] });

    expect(result.upserts).toEqual([base]);
  });

  test("skips excluded occurrence starts", async () => {
    const base = dailyBase();

    const withoutExdates = await projectSeriesMaterialization({
      base,
      ranges: [weekRange],
    });
    const excludedStart = withoutExdates.upserts[2]!.schedule.start;

    const result = await projectSeriesMaterialization({
      base,
      ranges: [weekRange],
      exdates: [excludedStart],
    });

    expect(result.upserts).toHaveLength(withoutExdates.upserts.length - 1);
    expect(
      result.upserts.some((event) => event.schedule.start === excludedStart),
    ).toBe(false);
  });

  test("keeps allDay schedules date-only", async () => {
    const base = createMockEvent({
      id: SERIES_ID,
      schedule: {
        kind: "allDay",
        start: "2026-07-06",
        end: "2026-07-07",
      } as never,
      recurrence: { kind: "series", rules: ["RRULE:FREQ=DAILY;COUNT=5"] },
    });

    const result = await projectSeriesMaterialization({
      base,
      ranges: [
        { start: "2026-07-05T00:00:00.000Z", end: "2026-07-12T00:00:00.000Z" },
      ],
    });

    const instances = result.upserts.slice(1);
    expect(instances.length).toBeGreaterThan(1);
    for (const instance of instances) {
      expect(instance.schedule.kind).toBe("allDay");
      expect(instance.schedule.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(instance.schedule.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("flattens instance ids when the base id is already a composite occurrence id", async () => {
    // Simulates a "thisAndFollowing" rebase: the remainder series' optimistic
    // id reuses the clicked instance's own composite id (SERIES_ID::start).
    // A prior implementation composed new instance ids by nesting a second
    // "::" onto that id — unparseable both client- and server-side, and (once
    // the server codec is unified) exactly the shape resolveCommandTarget now
    // rejects rather than silently escalating scope. Every produced id must
    // decode as flat: eventId=SERIES_ID (never the nested prefix).
    const alreadyComposite =
      `${SERIES_ID}::2026-07-06T16:00:00.000Z` as EventId;
    const base = createMockEvent({
      id: alreadyComposite,
      content: { kind: "details", title: "Standup", description: "" },
      schedule: {
        kind: "timed",
        start: "2026-07-06T16:00:00.000Z",
        end: "2026-07-06T17:00:00.000Z",
        timeZone: "UTC",
      } as never,
      recurrence: { kind: "series", rules: ["RRULE:FREQ=DAILY;COUNT=5"] },
    });

    const result = await projectSeriesMaterialization({
      base,
      ranges: [
        { start: "2026-07-05T00:00:00.000Z", end: "2026-07-12T00:00:00.000Z" },
      ],
    });

    const instances = result.upserts.slice(1);
    expect(instances.length).toBeGreaterThan(0);
    for (const instance of instances) {
      const separatorCount = instance.id.split("::").length - 1;
      expect(separatorCount).toBe(1);
      expect(instance.id).toStartWith(`${SERIES_ID}::`);
    }
  });
});
