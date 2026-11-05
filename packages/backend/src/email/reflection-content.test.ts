import { LIFE_QUOTES } from "@core/life/life-quotes";
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

const review = (
  overrides: Partial<Parameters<typeof renderReflectionEmail>[0]> = {},
) =>
  renderReflectionEmail({
    date: "2026-11-08",
    timeZone: "America/Denver",
    cadence: "weekly",
    recentStartDate: "2026-11-02",
    upcomingStartDate: "2026-11-09",
    recent: [event("Meeting", "2026-11-03")],
    upcoming: [event("Walk", "2026-11-10")],
    memories: [event("A trip", "2020-11-04")],
    weekMatch: () => true,
    historyComplete: true,
    completedWeeks: 1729,
    appUrl: "https://example.com/week/2026-11-09",
    unsubscribeUrl: "https://example.com/unsubscribe",
    ...overrides,
  });

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

  it("keeps recurring memories available while favoring one-off highlights", () => {
    const weekly = event("weekly", "2020-11-04", {
      recurring: true,
      schedule: {
        kind: "timed",
        start: "2020-11-04T17:00:00Z",
        end: "2020-11-04T18:00:00Z",
        timeZone: "America/Denver",
      },
    });
    const moved = {
      ...weekly,
      id: "moved",
      eventId: "moved",
      seriesId: "master",
      title: "Walk with a friend",
    };
    const oneOff = {
      ...weekly,
      id: "one-off",
      eventId: "one-off",
      recurring: false,
    };
    const sparse = selectReflectionEvents({ ...input, events: [moved] });
    expect(sparse.memories.map((memory) => memory.id)).toEqual(["moved"]);
    const ranked = selectReflectionEvents({
      ...input,
      events: [weekly, oneOff, moved],
    });
    expect(ranked.memories[0]?.id).toBe("one-off");
    expect(ranked.memories).toHaveLength(3);
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
  it("deduplicates identical cross-calendar facts even with different or missing UIDs before counting and selecting", () => {
    const holiday = event("holiday-one", "2026-11-03", {
      title: "Holiday",
      uid: "provider-one",
      calendarId: "one",
      windowKey: "recent",
    });
    const selected = selectReflectionEvents({
      ...input,
      events: [
        holiday,
        {
          ...holiday,
          id: "holiday-two",
          uid: "provider-two",
          calendarId: "two",
          title: "  HOLIDAY  ",
        },
        { ...holiday, id: "holiday-three", uid: null, calendarId: "three" },
        event("Lunch", "2026-11-04", { windowKey: "recent" }),
      ],
    });
    expect(selected.recent.map((e) => e.id)).toEqual(["holiday-one", "Lunch"]);
    const rendered = review({ ...selected });
    expect(rendered.text).toContain("Your calendar included 2 events.");
    expect(rendered.text.match(/: Holiday/g)).toHaveLength(1);
    expect(rendered.text).toContain(": Lunch");
  });
  it("preserves distinct dates, durations, same-calendar events and overlapping reflection windows", () => {
    const first = event("first", "2026-11-03", {
      title: "Walk",
      windowKey: "recent",
    });
    const sameCalendar = { ...first, id: "second" };
    const otherDay = event("third", "2026-11-04", {
      title: "Walk",
      calendarId: "other",
      windowKey: "recent",
    });
    const longer = {
      ...first,
      id: "longer",
      calendarId: "other",
      schedule: { ...first.schedule, end: "2026-11-05" },
    };
    const selected = selectReflectionEvents({
      ...input,
      events: [
        first,
        sameCalendar,
        otherDay,
        longer,
        { ...first, windowKey: "upcoming" },
      ],
    });
    expect(selected.recent).toHaveLength(4);
    expect(selected.upcoming).toHaveLength(1);
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
  it("reads like a plain review with upcoming plans immediately after the past week", () => {
    const rendered = review();
    expect(rendered.subject).toBe("Weekly review (45)");
    expect(rendered.text).not.toContain("Weekly review (45)");
    expect(rendered.html).not.toContain("Weekly review (45)");
    expect(rendered.text).toContain("Plan next week\nhttps://");
    expect(rendered.html).toContain("<strong>Next week, Nov 9-15</strong>");
    expect(rendered.text).toContain("Your past week, Nov 2-8");
    expect(rendered.text).toContain("Next week, Nov 9-15");
    expect(rendered.text.indexOf("Your past week")).toBeLessThan(
      rendered.text.indexOf("Next week"),
    );
    expect(rendered.text.indexOf("Next week")).toBeLessThan(
      rendered.text.indexOf("This time in your life"),
    );
    expect(rendered.text).toContain("Tue, Nov 3: Meeting");
    expect(rendered.text).toContain("This week 2020: A trip");
    expect(rendered.text).toContain("42% done (79-year average)");
    expect(rendered.text).not.toContain("America/Denver");
    expect(rendered.text).not.toContain("completed weeks");
    expect(rendered.text).not.toContain("U.S. reference");
    expect(rendered.text).not.toContain("prediction");
    expect(rendered.text).not.toContain("A little perspective");
    expect(rendered.text).not.toContain("2026-11-02 to");
    expect(rendered.html).not.toContain("style=");
    expect(rendered.html).not.toContain("font-family");
    expect(rendered.html).not.toContain("<img");
    expect(rendered.html).not.toContain("cid:");
    expect(LIFE_QUOTES.some((quote) => rendered.text.endsWith(quote))).toBe(
      true,
    );
  });

  it.each([
    ["2021-01-01", 53],
    ["2024-12-30", 1],
    ["2026-11-05", 45],
  ] as const)("uses the ISO week for %s", (date, number) => {
    expect(review({ date }).subject).toBe(`Weekly review (${number})`);
  });

  it("formats cross-month ranges, local event times and month fallback memories naturally", () => {
    const rendered = review({
      date: "2026-11-05",
      recentStartDate: "2026-10-29",
      weekMatch: () => false,
      recent: [
        event("Call", "2026-11-03", {
          schedule: {
            kind: "timed",
            start: "2026-11-03T16:30:00Z",
            end: "2026-11-03T17:30:00Z",
            timeZone: "America/Denver",
          },
        }),
      ],
    });
    expect(rendered.text).toContain("Oct 29 - Nov 5");
    expect(rendered.text).toContain("Tue, Nov 3 at 9:30 am: Call");
    expect(rendered.text).toContain("Around this time 2020: A trip");
    const crossing = review({
      date: "2027-01-03",
      recentStartDate: "2026-12-28",
    });
    expect(crossing.text).toContain("Dec 28, 2026 - Jan 3, 2027");
  });
});
