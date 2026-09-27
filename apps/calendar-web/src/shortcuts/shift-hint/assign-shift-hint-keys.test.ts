import {
  assignDayJumpKeys,
  DAY_JUMP_PREFIX_BY_WEEKDAY,
  DAY_JUMP_PREFIXES,
  dayJumpPrefixesForWeekdays,
  dayNameForPrefix,
  filterHintsByPrefix,
  matchDayJumpKeystroke,
} from "@web/shortcuts/shift-hint/assign-shift-hint-keys";
import { describe, expect, it } from "bun:test";

describe("assignDayJumpKeys", () => {
  it("assigns weekday prefixes and per-day indices chronologically", () => {
    const assignments = assignDayJumpKeys([
      {
        eventId: "wed-2",
        startMs: 200,
        eventType: "timed",
        dayKey: "2026-08-05",
        weekday: 3,
      },
      {
        eventId: "wed-1",
        startMs: 100,
        eventType: "timed",
        dayKey: "2026-08-05",
        weekday: 3,
      },
      {
        eventId: "mon-1",
        startMs: 50,
        eventType: "timed",
        dayKey: "2026-08-03",
        weekday: 1,
      },
    ]);

    expect(assignments).toEqual([
      {
        eventId: "mon-1",
        hint: "m1",
        dayKey: "2026-08-03",
        dayPrefix: "m",
        index: 1,
      },
      {
        eventId: "wed-1",
        hint: "w1",
        dayKey: "2026-08-05",
        dayPrefix: "w",
        index: 1,
      },
      {
        eventId: "wed-2",
        hint: "w2",
        dayKey: "2026-08-05",
        dayPrefix: "w",
        index: 2,
      },
    ]);
  });

  it("uses SU / SA / R / F prefixes from the weekday map", () => {
    expect(DAY_JUMP_PREFIX_BY_WEEKDAY[0]).toBe("su");
    expect(DAY_JUMP_PREFIX_BY_WEEKDAY[4]).toBe("r");
    expect(DAY_JUMP_PREFIX_BY_WEEKDAY[5]).toBe("f");
    expect(DAY_JUMP_PREFIX_BY_WEEKDAY[6]).toBe("sa");
    expect([...DAY_JUMP_PREFIXES]).toEqual(
      Object.values(DAY_JUMP_PREFIX_BY_WEEKDAY),
    );
    expect(dayNameForPrefix("w")).toBe("Wednesday");
    expect(dayNameForPrefix("unknown")).toBe("unknown");

    const assignments = assignDayJumpKeys([
      {
        eventId: "sun",
        startMs: 1,
        eventType: "timed",
        dayKey: "2026-08-02",
        weekday: 0,
      },
      {
        eventId: "sat",
        startMs: 1,
        eventType: "timed",
        dayKey: "2026-08-08",
        weekday: 6,
      },
      {
        eventId: "fri-10",
        startMs: 10,
        eventType: "timed",
        dayKey: "2026-08-07",
        weekday: 5,
      },
    ]);

    expect(assignments.map((item) => item.hint)).toEqual(["su1", "f1", "sa1"]);
  });

  it("prefers all-day before timed on equal start within a day", () => {
    const assignments = assignDayJumpKeys([
      {
        eventId: "timed",
        startMs: 100,
        eventType: "timed",
        dayKey: "2026-08-03",
        weekday: 1,
      },
      {
        eventId: "allday",
        startMs: 100,
        eventType: "all-day",
        dayKey: "2026-08-03",
        weekday: 1,
      },
    ]);
    expect(assignments.map((item) => item.hint)).toEqual(["m1", "m2"]);
    expect(assignments.map((item) => item.eventId)).toEqual([
      "allday",
      "timed",
    ]);
  });

  it("labels a single day's events with that weekday's prefix", () => {
    const assignments = assignDayJumpKeys([
      {
        eventId: "b",
        startMs: 200,
        eventType: "timed",
        dayKey: "2026-08-05",
        weekday: 3,
      },
      {
        eventId: "a",
        startMs: 100,
        eventType: "timed",
        dayKey: "2026-08-05",
        weekday: 3,
      },
    ]);
    expect(assignments).toEqual([
      {
        eventId: "a",
        hint: "w1",
        dayKey: "2026-08-05",
        dayPrefix: "w",
        index: 1,
      },
      {
        eventId: "b",
        hint: "w2",
        dayKey: "2026-08-05",
        dayPrefix: "w",
        index: 2,
      },
    ]);
  });

  it("supports double-digit indices", () => {
    const targets = Array.from({ length: 10 }, (_, index) => ({
      eventId: `e${index}`,
      startMs: index,
      eventType: "timed" as const,
      dayKey: "2026-08-07",
      weekday: 5,
    }));
    const assignments = assignDayJumpKeys(targets);
    expect(assignments[9]?.hint).toBe("f10");
  });
});

describe("matchDayJumpKeystroke", () => {
  const weekAssignments = assignDayJumpKeys([
    {
      eventId: "sun-event",
      startMs: 1,
      eventType: "timed",
      dayKey: "2026-08-02",
      weekday: 0,
    },
    {
      eventId: "wed-1",
      startMs: 1,
      eventType: "timed",
      dayKey: "2026-08-05",
      weekday: 3,
    },
    {
      eventId: "wed-2",
      startMs: 2,
      eventType: "timed",
      dayKey: "2026-08-05",
      weekday: 3,
    },
    {
      eventId: "wed-3",
      startMs: 3,
      eventType: "timed",
      dayKey: "2026-08-05",
      weekday: 3,
    },
    {
      eventId: "wed-4",
      startMs: 4,
      eventType: "timed",
      dayKey: "2026-08-05",
      weekday: 3,
    },
    {
      eventId: "sat-event",
      startMs: 1,
      eventType: "timed",
      dayKey: "2026-08-08",
      weekday: 6,
    },
    ...Array.from({ length: 10 }, (_, index) => ({
      eventId: `fri-${index + 1}`,
      startMs: index + 1,
      eventType: "timed" as const,
      dayKey: "2026-08-07",
      weekday: 5,
    })),
  ]);

  // The visible columns of the week above, Sunday 2026-08-02 through Saturday.
  const weekDayKeys = {
    su: "2026-08-02",
    m: "2026-08-03",
    t: "2026-08-04",
    w: "2026-08-05",
    r: "2026-08-06",
    f: "2026-08-07",
    sa: "2026-08-08",
  };

  it("selects a unique day and focuses its first event", () => {
    expect(
      matchDayJumpKeystroke({
        assignments: weekAssignments,
        dayKeyByPrefix: weekDayKeys,
        key: "w",
        buffer: "",
      }),
    ).toEqual({
      kind: "selectDay",
      dayPrefix: "w",
      dayKey: "2026-08-05",
      firstEventId: "wed-1",
      buffer: "w",
    });
  });

  it("narrows weekend on S then resolves SU / SA", () => {
    expect(
      matchDayJumpKeystroke({
        assignments: weekAssignments,
        dayKeyByPrefix: weekDayKeys,
        key: "s",
        buffer: "",
      }),
    ).toEqual({
      kind: "prefix",
      buffer: "s",
      dayKeys: ["2026-08-02", "2026-08-08"],
    });

    expect(
      matchDayJumpKeystroke({
        assignments: weekAssignments,
        dayKeyByPrefix: weekDayKeys,
        key: "u",
        buffer: "s",
      }),
    ).toEqual({
      kind: "selectDay",
      dayPrefix: "su",
      dayKey: "2026-08-02",
      firstEventId: "sun-event",
      buffer: "su",
    });

    expect(
      matchDayJumpKeystroke({
        assignments: weekAssignments,
        dayKeyByPrefix: weekDayKeys,
        key: "a",
        buffer: "s",
      }),
    ).toEqual({
      kind: "selectDay",
      dayPrefix: "sa",
      dayKey: "2026-08-08",
      firstEventId: "sat-event",
      buffer: "sa",
    });
  });

  it("focuses W4 after day selection", () => {
    expect(
      matchDayJumpKeystroke({
        assignments: weekAssignments,
        dayKeyByPrefix: weekDayKeys,
        key: "4",
        buffer: "w",
      }),
    ).toEqual({
      kind: "focus",
      eventId: "wed-4",
      dayKey: "2026-08-05",
      buffer: "w4",
    });
  });

  it("waits on F1 when F10 also exists, then focuses F10", () => {
    expect(
      matchDayJumpKeystroke({
        assignments: weekAssignments,
        dayKeyByPrefix: weekDayKeys,
        key: "1",
        buffer: "f",
      }),
    ).toEqual({
      kind: "prefix",
      buffer: "f1",
      dayKeys: ["2026-08-07"],
      pendingExactEventId: "fri-1",
    });

    expect(
      matchDayJumpKeystroke({
        assignments: weekAssignments,
        dayKeyByPrefix: weekDayKeys,
        key: "0",
        buffer: "f1",
      }),
    ).toEqual({
      kind: "focus",
      eventId: "fri-10",
      dayKey: "2026-08-07",
      buffer: "f10",
    });
  });

  it("abandons an unresolved weekend S when another day letter is typed", () => {
    expect(
      matchDayJumpKeystroke({
        assignments: weekAssignments,
        dayKeyByPrefix: weekDayKeys,
        key: "w",
        buffer: "s",
      }),
    ).toEqual({
      kind: "selectDay",
      dayPrefix: "w",
      dayKey: "2026-08-05",
      firstEventId: "wed-1",
      buffer: "w",
    });
  });

  it("selects an empty visible day with nothing to focus", () => {
    expect(
      matchDayJumpKeystroke({
        assignments: weekAssignments,
        dayKeyByPrefix: weekDayKeys,
        key: "r",
        buffer: "",
      }),
    ).toEqual({
      kind: "selectDay",
      dayPrefix: "r",
      dayKey: "2026-08-06",
      firstEventId: null,
      buffer: "r",
    });
  });

  it("narrows weekend to the visible weekend columns when they have no events", () => {
    expect(
      matchDayJumpKeystroke({
        assignments: [],
        dayKeyByPrefix: weekDayKeys,
        key: "s",
        buffer: "",
      }),
    ).toEqual({
      kind: "prefix",
      buffer: "s",
      dayKeys: ["2026-08-02", "2026-08-08"],
    });
    expect(
      matchDayJumpKeystroke({
        assignments: [],
        dayKeyByPrefix: weekDayKeys,
        key: "a",
        buffer: "s",
      }),
    ).toEqual({
      kind: "selectDay",
      dayPrefix: "sa",
      dayKey: "2026-08-08",
      firstEventId: null,
      buffer: "sa",
    });
  });

  it("does not select a day with no visible column", () => {
    expect(
      matchDayJumpKeystroke({
        assignments: [],
        dayKeyByPrefix: { w: "2026-08-05" },
        key: "t",
        buffer: "",
      }),
    ).toBeNull();
    expect(
      matchDayJumpKeystroke({
        assignments: [],
        dayKeyByPrefix: { w: "2026-08-05" },
        key: "s",
        buffer: "",
      }),
    ).toBeNull();
  });

  it("filters chips by prefix", () => {
    expect(
      filterHintsByPrefix(weekAssignments, "w").map((a) => a.hint),
    ).toEqual(["w1", "w2", "w3", "w4"]);
  });

  it("leaves a digit on an empty buffer for quick-time create", () => {
    expect(
      matchDayJumpKeystroke({
        assignments: weekAssignments,
        dayKeyByPrefix: weekDayKeys,
        key: "2",
        buffer: "",
      }),
    ).toBeNull();
  });
});

describe("dayJumpPrefixesForWeekdays", () => {
  it("returns the prefixes for the days that have events, in weekday order", () => {
    expect(dayJumpPrefixesForWeekdays([5, 3, 3, 0])).toEqual(["su", "w", "f"]);
  });

  it("is empty when nothing is scheduled", () => {
    expect(dayJumpPrefixesForWeekdays([])).toEqual([]);
  });
});
