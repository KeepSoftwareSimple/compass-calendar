import { act } from "react";
import {
  CIVIL_DAY_DENVER,
  CIVIL_DAY_US_FALL_BACK_YMD,
  CIVIL_DAY_US_SPRING_FORWARD_YMD,
} from "@core/test/civil-day.vectors.data";
import dayjs from "@core/util/date/dayjs";
import {
  formatNowLineTimeLabel,
  hourLabelIndexOverlappingNow,
  nowLineGridMinutes,
  nowLineTopPercent,
  nowTimeLabelPlacement,
} from "@web/grid/now-cue/now-line-time.util";
import { setPinnedTimeZone } from "@web/timezone/effective-timezone.store";
import { afterEach, describe, expect, it, setSystemTime } from "bun:test";

const denver = CIVIL_DAY_DENVER;

afterEach(() => {
  setSystemTime();
  act(() => setPinnedTimeZone(null));
});

describe("nowTimeLabelPlacement", () => {
  it("uses the gutter on a single day column", () => {
    expect(nowTimeLabelPlacement([{ date: dayjs("2026-04-24") }])).toBe(
      "gutter",
    );
  });

  it("uses the gutter when multiple columns share one civil day", () => {
    const day = dayjs("2026-04-24");
    expect(nowTimeLabelPlacement([{ date: day }, { date: day }])).toBe(
      "gutter",
    );
  });

  it("uses the column edge for a multi-day week", () => {
    const start = dayjs("2026-04-20");
    expect(
      nowTimeLabelPlacement(
        Array.from({ length: 7 }, (_, index) => ({
          date: start.add(index, "day"),
        })),
      ),
    ).toBe("column-edge");
  });
});

describe("formatNowLineTimeLabel and grid alignment", () => {
  it("formats wall time in the effective timezone", () => {
    act(() => setPinnedTimeZone(denver));
    setSystemTime(new Date("2026-04-24T13:37:00.000Z"));

    expect(formatNowLineTimeLabel(dayjs(), denver)).toBe("7:37 AM");
  });

  it("shares grid minutes and top percent with the now line on fall-back morning", () => {
    act(() => setPinnedTimeZone(denver));
    setSystemTime(new Date("2026-11-01T15:37:00.000Z"));

    const minutes = nowLineGridMinutes(dayjs(), denver);
    expect(minutes).toBe(8 * 60 + 37);
    expect(nowLineTopPercent(dayjs(), denver)).toBeCloseTo(
      ((8 * 60 + 37 - 60) / 60 / 13) * 100,
      5,
    );
    expect(formatNowLineTimeLabel(dayjs(), denver)).toBe("8:37 AM");
  });

  it("follows spring-forward civil slots", () => {
    act(() => setPinnedTimeZone(denver));
    setSystemTime(new Date("2026-03-08T16:30:00.000Z"));

    expect(nowLineGridMinutes(dayjs(), denver)).toBe(10 * 60 + 30);
    expect(formatNowLineTimeLabel(dayjs(), denver)).toBe("10:30 AM");
  });

  it("detects hour label overlap near the top of an hour row", () => {
    act(() => setPinnedTimeZone(denver));
    const reference = dayjs.tz(CIVIL_DAY_US_FALL_BACK_YMD, denver);
    const atSevenOhFive = 7 * 60 + 5;
    expect(
      hourLabelIndexOverlappingNow(atSevenOhFive, reference, denver),
    ).not.toBeNull();
    expect(
      hourLabelIndexOverlappingNow(7 * 60 + 37, reference, denver),
    ).toBeNull();
  });
});

describe("DST fall-back minute boundary", () => {
  it("steps from 1:59 AM to 1:00 AM labels across the repeated hour", () => {
    act(() => setPinnedTimeZone(denver));

    setSystemTime(new Date("2026-11-01T07:59:00.000Z"));
    expect(formatNowLineTimeLabel(dayjs(), denver)).toBe("1:59 AM");

    setSystemTime(new Date("2026-11-01T08:00:00.000Z"));
    expect(formatNowLineTimeLabel(dayjs(), denver)).toBe("1:00 AM");
  });

  it("uses spring-forward day reference without throwing", () => {
    act(() => setPinnedTimeZone(denver));
    setSystemTime(new Date("2026-03-08T09:30:00.000Z"));
    const reference = dayjs.tz(CIVIL_DAY_US_SPRING_FORWARD_YMD, denver);
    expect(formatNowLineTimeLabel(dayjs(), denver)).toBe("3:30 AM");
    expect(() =>
      hourLabelIndexOverlappingNow(
        nowLineGridMinutes(dayjs(), denver),
        reference,
        denver,
      ),
    ).not.toThrow();
  });
});
