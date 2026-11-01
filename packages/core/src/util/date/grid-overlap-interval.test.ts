import {
  GRID_TIMED_EVENT_MIN_DURATION_MINUTES,
  gridOverlapIntervalEnd,
} from "@core/util/date/grid-overlap-interval";
import { parseGridDateTime } from "@core/util/date/parse-grid-datetime";
import { describe, expect, it } from "bun:test";

const denver = "America/Denver";

describe("gridOverlapIntervalEnd", () => {
  it("keeps a valid end after start", () => {
    const start = parseGridDateTime("2026-10-31T19:00:00-06:00", denver);
    const end = parseGridDateTime("2026-10-31T20:00:00-06:00", denver);
    expect(gridOverlapIntervalEnd(start, end).format()).toBe(end.format());
  });

  it("extends a short event to the painted minimum duration", () => {
    const start = parseGridDateTime("2026-10-31T12:30:00-06:00", denver);
    const end = parseGridDateTime("2026-10-31T12:35:00-06:00", denver);
    expect(gridOverlapIntervalEnd(start, end).diff(start, "minute")).toBe(
      GRID_TIMED_EVENT_MIN_DURATION_MINUTES,
    );
  });

  it("extends an end that parses before start to the grid minimum duration", () => {
    const start = parseGridDateTime("2026-11-01T01:30:00.000Z", denver);
    const end = parseGridDateTime("2026-10-31T19:00:00.000", denver);
    expect(end.isBefore(start)).toBe(true);
    const normalized = gridOverlapIntervalEnd(start, end);
    expect(normalized.diff(start, "minute")).toBe(
      GRID_TIMED_EVENT_MIN_DURATION_MINUTES,
    );
  });
});
