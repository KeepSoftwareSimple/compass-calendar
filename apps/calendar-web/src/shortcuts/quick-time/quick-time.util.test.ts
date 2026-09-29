import dayjs from "@core/util/date/dayjs";
import {
  buildQuickTimeSlots,
  canQuickTimeBufferGrow,
  quickTimeFocusedColumnDay,
  quickTimeSequenceForHour,
  quickTimeTargetDay,
  resolveQuickTimeStart,
  timedEventsToBusyIntervals,
} from "@web/shortcuts/quick-time/quick-time.util";
import { describe, expect, it } from "bun:test";

const DAY = dayjs("2026-08-05T00:00:00");
const at = (time: string) => dayjs(`2026-08-05T${time}`);
const resolve = (digits: string) =>
  resolveQuickTimeStart(digits, DAY)?.format("HH:mm") ?? null;

describe("resolveQuickTimeStart", () => {
  it("reads four digits as 24-hour time", () => {
    expect(resolve("1100")).toBe("11:00");
    expect(resolve("1130")).toBe("11:30");
    expect(resolve("1700")).toBe("17:00");
    expect(resolve("2330")).toBe("23:30");
  });

  it("takes a leading-zero hour as morning", () => {
    expect(resolve("0500")).toBe("05:00");
    expect(resolve("0900")).toBe("09:00");
  });

  it("reads 12 and 1200 as noon and 0000 as midnight", () => {
    expect(resolve("12")).toBe("12:00");
    expect(resolve("1200")).toBe("12:00");
    expect(resolve("1230")).toBe("12:30");
    expect(resolve("0000")).toBe("00:00");
    expect(resolve("0")).toBe("00:00");
  });

  it("expands one and two digits to the top of the hour", () => {
    expect(resolve("9")).toBe("09:00");
    expect(resolve("11")).toBe("11:00");
    expect(resolve("23")).toBe("23:00");
  });

  it("expands three digits as H:MM", () => {
    expect(resolve("930")).toBe("09:30");
  });

  it("lands on the target day, not today", () => {
    const start = resolveQuickTimeStart("1700", dayjs("2026-08-09T00:00:00"));

    expect(start?.format("YYYY-MM-DD HH:mm")).toBe("2026-08-09 17:00");
  });

  it("rejects sequences that are not a clock time", () => {
    expect(resolve("99")).toBeNull();
    expect(resolve("2400")).toBeNull();
    expect(resolve("2599")).toBeNull();
    expect(resolve("")).toBeNull();
    expect(resolve("11305")).toBeNull();
  });
});

describe("canQuickTimeBufferGrow", () => {
  it("stops at four digits, where the buffer commits on its own", () => {
    expect(canQuickTimeBufferGrow("113")).toBe(true);
    expect(canQuickTimeBufferGrow("1130")).toBe(false);
  });
});

describe("quickTimeSequenceForHour", () => {
  it("advertises the 24-hour sequence for every hour but midnight", () => {
    expect(quickTimeSequenceForHour(9)).toBe("0900");
    expect(quickTimeSequenceForHour(11)).toBe("1100");
    expect(quickTimeSequenceForHour(12)).toBe("1200");
    expect(quickTimeSequenceForHour(17)).toBe("1700");
    expect(quickTimeSequenceForHour(0)).toBeNull();
  });
});

describe("quickTimeTargetDay", () => {
  const startOfView = dayjs("2026-08-02T00:00:00");
  const endOfView = dayjs("2026-08-08T23:59:59");

  it("uses today when the view contains it", () => {
    const now = dayjs("2026-08-05T09:00:00");

    expect(
      quickTimeTargetDay(startOfView, endOfView, now).format("YYYY-MM-DD"),
    ).toBe("2026-08-05");
  });

  it("falls back to the first visible day on another week", () => {
    const now = dayjs("2026-09-20T09:00:00");

    expect(
      quickTimeTargetDay(startOfView, endOfView, now).format("YYYY-MM-DD"),
    ).toBe("2026-08-02");
  });

  it("uses a focused column in the view instead of today", () => {
    const now = dayjs("2026-08-05T09:00:00");
    const focused = dayjs("2026-08-04T00:00:00");

    expect(
      quickTimeTargetDay(startOfView, endOfView, now, focused).format(
        "YYYY-MM-DD",
      ),
    ).toBe("2026-08-04");
  });

  it("ignores a focused day outside the view", () => {
    const now = dayjs("2026-08-05T09:00:00");
    const focused = dayjs("2026-09-01T00:00:00");

    expect(
      quickTimeTargetDay(startOfView, endOfView, now, focused).format(
        "YYYY-MM-DD",
      ),
    ).toBe("2026-08-05");
  });
});

describe("quickTimeFocusedColumnDay", () => {
  it("prefers a parked click over the jump-highlighted column", () => {
    expect(
      quickTimeFocusedColumnDay("2026-08-04", ["2026-08-05"])?.format(
        "YYYY-MM-DD",
      ),
    ).toBe("2026-08-04");
  });

  it("uses a single jump-highlighted column", () => {
    expect(
      quickTimeFocusedColumnDay(null, ["2026-08-07"])?.format("YYYY-MM-DD"),
    ).toBe("2026-08-07");
  });

  it("stays unset when jump has not chosen one day", () => {
    expect(quickTimeFocusedColumnDay(null, [])).toBeNull();
    expect(
      quickTimeFocusedColumnDay(null, ["2026-08-02", "2026-08-08"]),
    ).toBeNull();
  });
});

describe("buildQuickTimeSlots", () => {
  it("offers every open hour of the target day except midnight", () => {
    const slots = buildQuickTimeSlots({ busy: [], targetDay: DAY });
    const sequences = slots.map((slot) => slot.sequence);

    expect(sequences).toHaveLength(23);
    expect(sequences[0]).toBe("0100");
    expect(sequences.at(-1)).toBe("2300");
    expect(sequences).toContain("1000");
    expect(sequences).toContain("1100");
    expect(sequences).toContain("1200");
    expect(sequences).not.toContain("0000");
  });

  it("drops the hours an event already covers", () => {
    const slots = buildQuickTimeSlots({
      busy: [
        {
          startMs: at("09:30").valueOf(),
          endMs: at("10:15").valueOf(),
        },
      ],
      targetDay: DAY,
    });

    const sequences = slots.map((slot) => slot.sequence);
    expect(sequences).not.toContain("0900");
    expect(sequences).not.toContain("1000");
    expect(sequences).toContain("0800");
    expect(sequences).toContain("1100");
  });

  it("keeps an hour an event only touches at the boundary", () => {
    const slots = buildQuickTimeSlots({
      busy: [{ startMs: at("10:00").valueOf(), endMs: at("11:00").valueOf() }],
      targetDay: DAY,
    });

    const sequences = slots.map((slot) => slot.sequence);
    expect(sequences).toContain("0900");
    expect(sequences).not.toContain("1000");
    expect(sequences).toContain("1100");
  });
});

describe("timedEventsToBusyIntervals", () => {
  it("keeps only events that have both ends", () => {
    expect(
      timedEventsToBusyIntervals([
        { startDate: at("09:00").format(), endDate: at("10:00").format() },
        { startDate: at("11:00").format() },
        { endDate: at("12:00").format() },
      ]),
    ).toEqual([
      {
        startMs: at("09:00").valueOf(),
        endMs: at("10:00").valueOf(),
      },
    ]);
  });
});
