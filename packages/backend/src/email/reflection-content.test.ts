import { ReflectionEventSchema } from "@core/types/sync/reflection.contracts";
import {
  renderReflectionEmail,
  selectReflectionEvents,
} from "@backend/email/reflection-content";
import { describe, expect, it } from "bun:test";

const event = (id: string, date: string, overrides = {}) =>
  ReflectionEventSchema.parse({
    id,
    eventId: id,
    seriesId: null,
    calendarId: "calendar",
    title: id,
    schedule: {
      kind: "allDay",
      start: date,
      end: `${date.slice(0, 8)}${String(Number(date.slice(8)) + 1).padStart(2, "0")}`,
    },
    recurring: false,
    uid: null,
    windowKey: "history:2020",
    ...overrides,
  });
const input = {
  timeZone: "America/Denver",
  cutoff: new Date("2026-11-08T17:30:00Z"),
  recentStartDate: "2026-11-02",
  hiddenIds: new Set<string>(),
  previousMemoryIds: new Set<string>(),
};

describe("reflection content", () => {
  it("searches the historical week first and supplements from the month", () => {
    const selected = selectReflectionEvents({
      ...input,
      events: [
        event("month", "2020-11-20"),
        event("week", "2020-11-04"),
        event("older", "2015-11-05", { windowKey: "history:2015" }),
      ],
    });
    expect(selected.memories.map((memory) => memory.id)).toEqual([
      expect.stringMatching(/week|older/),
      expect.stringMatching(/week|older/),
      "month",
    ]);
    expect(selected.weekMatch(selected.memories[0]!)).toBe(true);
    expect(selected.weekMatch(selected.memories[2]!)).toBe(false);
  });
  it("avoids recently used memories when another week match exists", () => {
    const selected = selectReflectionEvents({
      ...input,
      previousMemoryIds: new Set(["repeated"]),
      events: [event("repeated", "2020-11-04"), event("fresh", "2020-11-05")],
    });
    expect(selected.memories[0]?.id).toBe("fresh");
  });
  it("hides series exceptions and deduplicates shared UIDs at equivalent instants", () => {
    const schedule = {
      kind: "timed",
      start: "2020-11-04T10:00:00-07:00",
      end: "2020-11-04T11:00:00-07:00",
      timeZone: "America/Denver",
    };
    const first = event("copy-one", "2020-11-04", { uid: "shared", schedule });
    const second = event("copy-two", "2020-11-04", {
      uid: "shared",
      schedule: {
        ...schedule,
        start: "2020-11-04T17:00:00Z",
        end: "2020-11-04T18:00:00Z",
      },
    });
    const selected = selectReflectionEvents({
      ...input,
      hiddenIds: new Set(["master"]),
      events: [
        first,
        second,
        event("exception", "2020-11-05", { seriesId: "master" }),
      ],
    });
    expect(selected.memories).toHaveLength(1);
  });
  it("omits empty memories and safely escapes event titles without claiming attendance", () => {
    const rendered = renderReflectionEmail({
      date: "2026-11-08",
      timeZone: "America/Denver",
      cadence: "weekly",
      recentStartDate: "2026-11-02",
      upcomingStartDate: "2026-11-09",
      recent: [
        event("meeting", "2026-11-03", { title: "<script>test</script>" }),
      ],
      upcoming: [],
      memories: [],
      weekMatch: () => false,
      historyComplete: true,
      completedWeeks: null,
      appUrl: "https://example.com/week/2026-11-09",
      unsubscribeUrl: "https://example.com/unsubscribe",
    });
    expect(rendered.html).toContain("&lt;script&gt;");
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.text).not.toContain("This time in your life");
    expect(rendered.text).toContain("Your calendar included");
    expect(rendered.text).not.toContain("you attended");
    expect(rendered.text).toContain("https://example.com/week/2026-11-09");
  });
});
