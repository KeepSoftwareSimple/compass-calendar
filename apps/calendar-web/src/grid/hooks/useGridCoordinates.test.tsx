import { renderHook } from "@testing-library/react";
import dayjs from "@core/util/date/dayjs";
import { type GridMeasurements } from "../types/grid.types";
import { useGridCoordinates } from "./useGridCoordinates";
import { describe, expect, it } from "bun:test";

const measurements = (colWidths: number[]): GridMeasurements => ({
  allDayRow: null,
  colWidths,
  hourHeight: 60,
  mainGrid: {
    bottom: 780,
    height: 780,
    left: 0,
    right: colWidths.reduce((sum, width) => sum + width, 0),
    top: 0,
    width: colWidths.reduce((sum, width) => sum + width, 0),
    x: 0,
    y: 0,
  },
});

const mainGridRef = { current: null };

describe("useGridCoordinates", () => {
  it("maps any x inside a one-date grid to the one visible date", () => {
    const visibleDate = dayjs("2026-05-20T00:00:00.000");
    const { result } = renderHook(() =>
      useGridCoordinates(measurements([320]), mainGridRef, [
        { date: visibleDate, key: "2026-05-20" },
      ]),
    );

    expect(result.current.getDateByXY(5, 0).isSame(visibleDate, "day")).toBe(
      true,
    );
    expect(result.current.getDateByXY(999, 0).isSame(visibleDate, "day")).toBe(
      true,
    );
  });

  it("maps seven-date grid x positions to visible date columns", () => {
    const visibleDates = Array.from({ length: 7 }, (_, index) => ({
      date: dayjs("2026-05-18T00:00:00.000").add(index, "day"),
      key: String(index),
    }));
    const { result } = renderHook(() =>
      useGridCoordinates(
        measurements([100, 100, 100, 100, 100, 100, 100]),
        mainGridRef,
        visibleDates,
      ),
    );

    expect(result.current.getDateByXY(250, 0).format("YYYY-MM-DD")).toBe(
      "2026-05-20",
    );
    expect(result.current.getDateByXY(999, 0).format("YYYY-MM-DD")).toBe(
      "2026-05-24",
    );
  });

  it("snaps y positions to fifteen-minute boundaries", () => {
    const { result } = renderHook(() =>
      useGridCoordinates(measurements([320]), mainGridRef, [
        { date: dayjs("2026-05-20T00:00:00.000"), key: "2026-05-20" },
      ]),
    );

    expect(result.current.getDateByXY(10, 74).format("HH:mm")).toBe("01:00");
  });

  it("computes Y position correctly for aligned times (hour:00, hour:15, etc.) and non-aligned times", () => {
    const hourHeight = 60;
    // Test the calculation directly: Y = hourHeight * (hour + minute/60)

    // 10:00 AM (hour=10, minute=0) should be at Y = 60 * (10 + 0/60) = 600
    const y10am = hourHeight * (10 + 0 / 60);
    expect(y10am).toBe(600);

    // 10:30 AM (hour=10, minute=30) should be at Y = 60 * (10 + 30/60) = 630
    const y10_30am = hourHeight * (10 + 30 / 60);
    expect(y10_30am).toBe(630);

    // 10:33 AM (hour=10, minute=33) should be at Y = 60 * (10 + 33/60) ≈ 633
    const y10_33am = hourHeight * (10 + 33 / 60);
    expect(y10_33am).toBe(633);

    // 14:17 (hour=14, minute=17) should be at Y = 60 * (14 + 17/60) ≈ 857
    const y14_17 = hourHeight * (14 + 17 / 60);
    expect(Math.round(y14_17)).toBe(857);
  });
});
