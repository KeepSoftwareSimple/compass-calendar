import {
  LIFE_PDF_QUOTE,
  LIFE_QUOTES,
  REFLECTION_EMAIL_QUOTES,
} from "@core/life/life-quotes";
import { ReflectionEventSchema } from "@core/types/sync/reflection.contracts";
import dayjs from "@core/util/date/dayjs";
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
    hasMeetingPage: false,
    unsubscribeUrl: "https://example.com/unsubscribe",
    ...overrides,
  });

describe("reflection content", () => {
  it("omits daily and weekly routines without excluding less frequent repeats", () => {
    const selected = selectReflectionEvents({
      ...input,
      events: [
        event("Daily lunch", "2026-11-09", {
          windowKey: "upcoming",
          recurring: true,
          routine: true,
        }),
        event("Weekly planning block", "2026-11-10", {
          windowKey: "upcoming",
          recurring: true,
          routine: true,
        }),
        event("Birthday", "2026-11-12", {
          windowKey: "upcoming",
          recurring: true,
        }),
        event("Trip", "2026-11-11", { windowKey: "upcoming" }),
      ],
    });
    expect(selected.upcoming.map((event) => event.title)).toEqual([
      "Trip",
      "Birthday",
    ]);
  });
  it("does not call already-started appointments upcoming when the recap ends at midnight", () => {
    const timed = (id: string, start: string, end: string) =>
      event(id, "2026-11-08", {
        windowKey: "upcoming",
        schedule: { kind: "timed", start, end, timeZone: "America/Denver" },
      });
    const selected = selectReflectionEvents({
      ...input,
      cutoff: new Date("2026-11-08T07:00:00Z"),
      upcomingCutoff: input.cutoff,
      events: [
        timed("Breakfast", "2026-11-08T15:00:00Z", "2026-11-08T16:00:00Z"),
        timed("Interview", "2026-11-08T18:00:00Z", "2026-11-08T19:00:00Z"),
        event("Birthday", "2026-11-08", { windowKey: "upcoming" }),
      ],
    });
    expect(selected.upcoming.map((event) => event.id)).toEqual([
      "Interview",
      "Birthday",
    ]);
  });

  it("surfaces every upcoming meeting ahead of solo events, including recurring meetings", () => {
    const meeting = { windowKey: "upcoming", recurring: true, routine: true };
    const selected = selectReflectionEvents({
      ...input,
      events: [
        event("Focus time", "2026-11-09", { windowKey: "upcoming" }),
        event("Design review", "2026-11-14", { ...meeting, hasGuests: true }),
        event("Design review", "2026-11-14", {
          ...meeting,
          calendarId: "another-calendar",
        }),
        event("Weekly standup", "2026-11-12", meeting),
        event("Client call", "2026-11-10", meeting),
        event("Coffee with Sam", "2026-11-11", meeting),
      ],
    });
    expect(selected.upcoming.map(({ title }) => title)).toEqual([
      "Design review",
      "Client call",
      "Coffee with Sam",
      "Weekly standup",
      "Focus time",
    ]);
    const rendered = review({ ...selected });
    expect(rendered.text).toContain("Weekly standup");
    expect(rendered.text).not.toContain("Focus time");
  });

  it("groups the two next steps below the upcoming week", () => {
    const { html, text } = review({ memories: [], completedWeeks: null });
    expect(text).toContain(
      "Tue, Nov 10: Walk\n\nNext steps:\nPlan next week: https://example.com/week/2026-11-09\n\nSet up your meeting page: https://example.com/meet\n\n",
    );
    expect(text).not.toContain("utm_");
    expect(html).toContain(
      '<p><strong>Next steps:</strong><br>Plan next week: <a href="https://example.com/week/2026-11-09?utm_source=email&amp;utm_campaign=weekly_review&amp;utm_content=plan_next_week">example.com/week/2026-11-09</a><br><br>Set up your meeting page: <a href="https://example.com/meet?utm_source=email&amp;utm_campaign=weekly_review&amp;utm_content=meeting_setup">example.com/meet</a></p><p><em>',
    );
  });

  it("offers only the calendar link when a meeting page is configured", () => {
    const { html, text } = review({ hasMeetingPage: true });
    expect(html).toContain("Plan next week:");
    expect(text).toContain("Plan next week:");
    expect(html).not.toContain("Set up your meeting page");
    expect(text).not.toContain("Set up your meeting page");
  });

  it("orders selected highlights by local date and time and shows repeated titles only once per group", () => {
    const rest = event("rest-one", "2026-11-03", { title: "Rest" });
    const timed = (id: string, start: string) =>
      event(id, "2026-11-03", {
        schedule: {
          kind: "timed",
          start,
          end: dayjs(start).add(1, "hour").toISOString(),
          timeZone: "America/Denver",
        },
      });
    const rendered = review({
      recent: [
        event("Later", "2026-11-05"),
        rest,
        { ...rest, id: "rest-two", title: "  REST  " },
        timed("Early", "2026-11-03T12:00:00Z"),
      ],
      upcoming: [
        event("Later plan", "2026-11-12"),
        event("First plan", "2026-11-09"),
        event("Same day plan", "2026-11-09"),
      ],
      memories: [
        event("2011 memory", "2011-11-04"),
        event("2023 memory", "2023-11-04"),
        event("2016 memory", "2016-11-04"),
      ],
    });
    for (const content of [rendered.text, rendered.html]) {
      expect(content.indexOf(": Rest")).toBeLessThan(
        content.indexOf(": Early"),
      );
      expect(content.indexOf(": Early")).toBeLessThan(
        content.indexOf(": Later"),
      );
      expect(content.indexOf(": First plan")).toBeLessThan(
        content.indexOf(": Same day plan"),
      );
      expect(content.indexOf(": Same day plan")).toBeLessThan(
        content.indexOf(": Later plan"),
      );
      expect(content.indexOf("2011: 2011 memory")).toBeLessThan(
        content.indexOf("2016: 2016 memory"),
      );
      expect(content.indexOf("2016: 2016 memory")).toBeLessThan(
        content.indexOf("2023: 2023 memory"),
      );
      expect(content.match(/: Rest/g)).toHaveLength(1);
      expect(content).not.toContain(":   REST");
    }
  });

  it.each(["recent", "upcoming"] as const)(
    "spreads %s highlights across local dates before selecting another event from the same day",
    (section) => {
      const candidates = [
        event("First priority", "2026-11-09"),
        event("Another same day", "2026-11-09"),
        event("Third same day", "2026-11-09"),
        event("Next day", "2026-11-10"),
        event("Later day", "2026-11-12"),
      ];
      const rendered = review({ [section]: candidates });
      for (const content of [rendered.text, rendered.html]) {
        expect(content).toContain(": First priority");
        expect(content).toContain(": Next day");
        expect(content).toContain(": Later day");
        expect(content).not.toContain(": Another same day");
        expect(content).not.toContain(": Third same day");
        expect(content.indexOf(": First priority")).toBeLessThan(
          content.indexOf(": Next day"),
        );
        expect(content.indexOf(": Next day")).toBeLessThan(
          content.indexOf(": Later day"),
        );
      }
    },
  );

  it("moves a repeated title to a sparse day so another busy-day event can represent the first day", () => {
    const rendered = review({
      recent: [
        event("rest-first-day", "2026-11-03", { title: "Rest" }),
        event("Kiln", "2026-11-03"),
        event("rest-second-day", "2026-11-04", { title: " REST " }),
        event("Trip", "2026-11-05"),
      ],
    });
    expect(rendered.text).toContain("Tue, Nov 3: Kiln");
    expect(rendered.text).toContain("Wed, Nov 4:  REST ");
    expect(rendered.text).toContain("Thu, Nov 5: Trip");
    expect(rendered.text).not.toContain("Tue, Nov 3: Rest");
  });

  it("uses the recipient's local date when mixing timed and all-day highlights", () => {
    const rendered = review({
      upcoming: [
        event("First local day", "2026-11-09"),
        event("Still the same local day", "2026-11-10", {
          schedule: {
            kind: "timed",
            start: "2026-11-10T00:30:00Z",
            end: "2026-11-10T01:30:00Z",
            timeZone: "UTC",
          },
        }),
        event("Next local day", "2026-11-10"),
        event("Third local day", "2026-11-11"),
      ],
    });
    expect(rendered.text).not.toContain(": Still the same local day");
    expect(rendered.text).toContain("Mon, Nov 9: First local day");
    expect(rendered.text).toContain("Tue, Nov 10: Next local day");
    expect(rendered.text).toContain("Wed, Nov 11: Third local day");
  });

  it("fills remaining slots from the same day in sparse weeks without repeating titles", () => {
    const rendered = review({
      recent: [
        event("First", "2026-11-03"),
        event("Second", "2026-11-03"),
        event("repeat-first", "2026-11-03", { title: " FIRST " }),
        event("Other day", "2026-11-05"),
      ],
      upcoming: [
        event("Only day first", "2026-11-09"),
        event("Only day second", "2026-11-09"),
        event("Only day third", "2026-11-09"),
      ],
    });
    for (const title of [
      "First",
      "Second",
      "Other day",
      "Only day first",
      "Only day second",
      "Only day third",
    ])
      expect(rendered.text).toContain(`: ${title}`);
    expect(rendered.text).not.toContain(":  FIRST");
  });

  it("fills memory highlights with distinct titles even when repeated events have different dates", () => {
    const selected = selectReflectionEvents({
      ...input,
      events: [
        event("rest-one", "2020-11-03", { title: "Rest" }),
        event("rest-two", "2020-11-04", { title: " rest " }),
        event("Trip", "2020-11-05"),
        event("Visit", "2020-11-06"),
      ],
    });
    expect(selected.memories).toHaveLength(3);
    expect(
      new Set(
        selected.memories.map((memory) => memory.title.trim().toLowerCase()),
      ).size,
    ).toBe(3);
  });

  it("shows non-overlapping whole-day ranges for the daily trial", () => {
    const rendered = review({
      date: "2026-11-07",
      cadence: "daily",
      recentStartDate: "2026-10-31",
      upcomingStartDate: "2026-11-07",
    });
    expect(rendered.text).toContain("Your past week, Oct 31 - Nov 6");
    expect(rendered.text).toContain("Next week, Nov 7-13");
  });
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
    expect(ranked.memories.map((memory) => memory.id)).toEqual([
      "one-off",
      "moved",
    ]);
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
  it("keeps holiday calendar events out of memories but not out of the week", () => {
    const selected = selectReflectionEvents({
      ...input,
      holidayCalendarIds: new Set(["holidays"]),
      events: [
        event("Veterans Day", "2022-11-04", { calendarId: "holidays" }),
        event("Veterans Day now", "2026-11-04", {
          calendarId: "holidays",
          windowKey: "recent",
        }),
        event("A trip", "2020-11-04"),
      ],
    });
    expect(selected.memories.map((memory) => memory.id)).toEqual(["A trip"]);
    expect(selected.recent.map((e) => e.id)).toEqual(["Veterans Day now"]);
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
    expect(rendered.text).not.toContain("Your calendar included");
    expect(rendered.text.match(/: Holiday/g)).toHaveLength(1);
    expect(rendered.text).toContain(": Lunch");
  });
  it("preserves distinct dates, durations, same-calendar events while excluding past events from upcoming", () => {
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
    expect(selected.upcoming).toHaveLength(0);
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
      hasMeetingPage: false,
      unsubscribeUrl: "https://example.com/unsubscribe",
    });
    expect(rendered.html).toContain("&lt;script&gt;");
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.text).not.toContain("This time in your life");
    expect(rendered.text).not.toContain("Your calendar included");
    expect(rendered.text).not.toContain("you attended");
    expect(rendered.text).toContain("https://example.com/week/2026-11-09");
  });
  it("reads like a plain review with upcoming plans immediately after the past week", () => {
    const rendered = review();
    expect(rendered.subject).toBe("Your weekly review (45)");
    expect(rendered.text).not.toContain("Your weekly review (45)");
    expect(rendered.html).not.toContain("Your weekly review (45)");
    expect(rendered.text).toContain("Plan next week: https://");
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
    expect(rendered.text).toContain("2020: A trip");
    expect(rendered.text).toContain("42% done (79-year average)");
    expect(rendered.text).not.toContain("America/Denver");
    expect(rendered.text).not.toContain("completed weeks");
    expect(rendered.text).not.toContain("U.S. reference");
    expect(rendered.text).not.toContain("prediction");
    expect(rendered.text).not.toContain("A little perspective");
    expect(rendered.text).not.toContain("This week 2020");
    expect(rendered.text).not.toContain("Around this time 2020");
    expect(rendered.text).not.toContain("2026-11-02 to");
    expect(rendered.html).not.toContain("style=");
    expect(rendered.html).not.toContain("font-family");
    expect(rendered.html).not.toContain("<img");
    expect(rendered.html).not.toContain("cid:");
    expect(
      REFLECTION_EMAIL_QUOTES.some((quote) =>
        rendered.text.includes(`${quote}\n\nUnsubscribe:`),
      ),
    ).toBe(true);
    // The email's three and the PDF quote must stay part of the Life catalog.
    expect(LIFE_QUOTES).toEqual(
      expect.arrayContaining([...REFLECTION_EMAIL_QUOTES, LIFE_PDF_QUOTE]),
    );
  });

  it.each([
    ["2021-01-01", 53],
    ["2024-12-30", 1],
    ["2026-11-05", 45],
  ] as const)("uses the ISO week for %s", (date, number) => {
    expect(review({ date }).subject).toBe(`Your weekly review (${number})`);
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
    expect(rendered.text).toContain("2020: A trip");
    const crossing = review({
      date: "2027-01-03",
      recentStartDate: "2026-12-28",
    });
    expect(crossing.text).toContain("Dec 28, 2026 - Jan 3, 2027");
  });
});
