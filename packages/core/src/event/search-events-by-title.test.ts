import { searchEventsByTitle } from "@core/event/search-events-by-title";
import { DateTimeSchema } from "@core/types/domain-primitives";
import { type Event, type EventRecurrence } from "@core/types/event.contracts";
import { describe, expect, it } from "bun:test";

const NOW = Date.parse("2026-09-15T12:00:00.000Z");

const event = (overrides: {
  id?: string;
  title: string;
  start: string;
  kind?: "timed" | "allDay";
  recurrence?: EventRecurrence;
}): Event =>
  ({
    id:
      overrides.id ??
      overrides.title.replace(/\W/g, "").padEnd(24, "0").slice(0, 24),
    calendarId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    content: { kind: "details", title: overrides.title, description: "" },
    schedule:
      overrides.kind === "allDay"
        ? { kind: "allDay", start: overrides.start, end: "2099-01-02" }
        : {
            kind: "timed",
            start: overrides.start,
            end: "2099-01-01T01:00:00.000Z",
            timeZone: "UTC",
          },
    recurrence: overrides.recurrence ?? { kind: "single" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: null,
  }) as Event;

describe("searchEventsByTitle", () => {
  it("matches titles case-insensitively", () => {
    const hits = searchEventsByTitle(
      [
        event({ title: "Dentist", start: "2026-09-16T09:00:00.000Z" }),
        event({ title: "Standup", start: "2026-09-16T10:00:00.000Z" }),
      ],
      "dent",
      NOW,
    );

    expect(hits.map((hit) => hit.content)).toEqual([
      expect.objectContaining({ title: "Dentist" }),
    ]);
  });

  it("treats regex metacharacters as literal characters", () => {
    const hits = searchEventsByTitle(
      [event({ title: "Q(1)", start: "2026-09-16T09:00:00.000Z" })],
      "Q(",
      NOW,
    );

    expect(hits).toHaveLength(1);
  });

  it("excludes events whose start is more than a year away", () => {
    const hits = searchEventsByTitle(
      [
        event({ title: "Near", start: "2026-09-16T09:00:00.000Z" }),
        event({ title: "Near", start: "2024-09-01T09:00:00.000Z" }),
        event({ title: "Near", start: "2028-09-01T09:00:00.000Z" }),
      ],
      "near",
      NOW,
    );

    expect(hits).toHaveLength(1);
    expect(hits[0]?.schedule.start).toBe(
      DateTimeSchema.parse("2026-09-16T09:00:00.000Z"),
    );
  });

  it("caps at 20 and prefers the nearest start", () => {
    const many = Array.from({ length: 25 }, (_, index) =>
      event({
        title: "Near",
        start: new Date(NOW + (index + 1) * 86_400_000).toISOString(),
      }),
    );

    const hits = searchEventsByTitle(many, "near", NOW);

    expect(hits).toHaveLength(20);
    expect(hits[0]?.schedule.start).toBe(many[0]?.schedule.start);
  });

  it("collapses a recurring series to its nearest occurrence", () => {
    const seriesId = "devotionseries00000000000";
    const master = event({
      id: seriesId,
      title: "Devotion",
      start: "2026-01-01T09:00:00.000Z",
      recurrence: { kind: "series", rules: ["FREQ=DAILY"] },
    });
    const occurrences = Array.from({ length: 30 }, (_, index) =>
      event({
        id: `devotionocc${index}`.padEnd(24, "0").slice(0, 24),
        title: "Devotion",
        start: new Date(NOW + (index - 15) * 86_400_000).toISOString(),
        recurrence: { kind: "occurrence", seriesId },
      }),
    );
    const single = event({
      title: "Dev sync",
      start: "2026-09-16T09:00:00.000Z",
    });

    const hits = searchEventsByTitle(
      [master, ...occurrences, single],
      "dev",
      NOW,
    );

    expect(hits).toHaveLength(2);
    const nearestOccurrence = [...occurrences].sort(
      (left, right) =>
        Math.abs(Date.parse(left.schedule.start) - NOW) -
        Math.abs(Date.parse(right.schedule.start) - NOW),
    )[0];
    expect(hits.map((hit) => hit.id)).toEqual(
      expect.arrayContaining([nearestOccurrence?.id, single.id]),
    );
    expect(hits.some((hit) => hit.id === seriesId)).toBe(false);
  });

  it("keeps the series master when no occurrence matches the query", () => {
    const seriesId = "standaloneseries000000000";
    const master = event({
      id: seriesId,
      title: "Standalone Series",
      start: "2026-09-16T09:00:00.000Z",
      recurrence: { kind: "series", rules: ["FREQ=DAILY"] },
    });

    const hits = searchEventsByTitle([master], "standalone", NOW);

    expect(hits).toHaveLength(1);
    expect(hits[0]?.id).toBe(seriesId);
  });
});
