import {
  formatUpNextNudgeMultiSummary,
  projectUpNextNudgeWindow,
  type UpNextNudgeCandidate,
  upNextPickerTitle,
} from "@core/up-next/up-next-nudge-window.util";
import dayjs from "@core/util/date/dayjs";
import { describe, expect, it } from "bun:test";

const NOW = dayjs("2026-03-10T15:00:00.000Z");

const candidate = (
  id: string,
  startOffsetMinutes: number,
  durationMinutes = 30,
): UpNextNudgeCandidate => {
  const start = NOW.add(startOffsetMinutes, "minute");
  return {
    id,
    title: id,
    startDate: start.format(),
    endDate: start.add(durationMinutes, "minute").format(),
  };
};

describe("projectUpNextNudgeWindow", () => {
  it("includes every in-progress event and upcoming events within the lead window", () => {
    const window = projectUpNextNudgeWindow(
      [
        candidate("current-a", -10),
        candidate("current-b", -5),
        candidate("soon", 2),
        candidate("later", 30),
      ],
      NOW,
    );

    expect(window.occurrences.map((event) => event.id)).toEqual([
      "current-a",
      "current-b",
      "soon",
    ]);
    expect(window.primary?.id).toBe("current-a");
    expect(window.isPrimaryCurrent).toBe(true);
    expect(window.hasCurrentEvent).toBe(true);
  });

  it("orders upcoming-only windows by start time", () => {
    const window = projectUpNextNudgeWindow(
      [candidate("second", 2), candidate("first", 1)],
      NOW,
    );

    expect(window.occurrences.map((event) => event.id)).toEqual([
      "first",
      "second",
    ]);
    expect(window.hasCurrentEvent).toBe(false);
  });
});

describe("formatUpNextNudgeMultiSummary", () => {
  it("reflects current vs upcoming-only sets", () => {
    expect(formatUpNextNudgeMultiSummary(2, true)).toBe("2 events now");
    expect(formatUpNextNudgeMultiSummary(2, false)).toBe(
      "2 events starting soon",
    );
  });
});

describe("upNextPickerTitle", () => {
  it("uses upcoming wording when every option is still ahead", () => {
    expect(upNextPickerTitle(2, false)).toBe(
      "You have 2 upcoming events. Select which event to open",
    );
  });

  it("uses neutral events wording when any option is in progress", () => {
    expect(upNextPickerTitle(2, true)).toBe(
      "You have 2 events. Select which event to open",
    );
  });
});
