import { ObjectId } from "bson";
import { act } from "react";
import {
  CIVIL_DAY_DENVER,
  CIVIL_DAY_NEW_YORK,
  CIVIL_DAY_US_FALL_BACK_YMD,
  CIVIL_DAY_US_SPRING_FORWARD_YMD,
} from "@core/test/civil-day.vectors.data";
import {
  civilDayLengthMinutes,
  civilHourSlotCount,
  formatInstantInTimeZone,
} from "@core/util/date/civil-day";
import dayjs from "@core/util/date/dayjs";
import { CompassEventRRule } from "@core/util/event/compass.event.rrule";
import { getHourLabels } from "@web/common/utils/datetime/web.date.util";
import {
  getCurrentPercentOfDay,
  getScrollToNowTop,
} from "@web/common/utils/grid/grid.util";
import { getTimedEventPosition } from "@web/grid/layout/event.position";
import {
  resetEffectiveTimeZoneStoreForTests,
  setBrowserTimeZoneForTests,
  setPinnedTimeZone,
} from "@web/timezone/effective-timezone.store";
import { mappedHourLabels } from "@web/timezone/mapped-hour-labels";
import {
  resetTimeTravelStoreForTests,
  setTimeTravelZone,
} from "@web/timezone/time-travel.store";
import { timedIntentAt } from "@web/views/Week/pointer-intent/grid-pointer-target";
import { afterEach, describe, expect, it, setSystemTime } from "bun:test";

const denver = CIVIL_DAY_DENVER;
const london = "Europe/London";
const newYork = CIVIL_DAY_NEW_YORK;
const fallBackDenver = CIVIL_DAY_US_FALL_BACK_YMD;
const springForwardDenver = CIVIL_DAY_US_SPRING_FORWARD_YMD;

const visibleDenverDates = (dayKey: string) => [
  { date: dayjs.tz(`${dayKey}T12:00`, denver), key: dayKey },
];

const measurements = {
  allDayRow: null,
  colWidths: [320],
  hourHeight: 60,
  mainGrid: {
    bottom: 1800,
    height: 780,
    left: 0,
    right: 320,
    top: 0,
    width: 320,
    x: 0,
    y: 0,
  },
};

afterEach(() => {
  setSystemTime();
  act(() => {
    resetEffectiveTimeZoneStoreForTests();
    resetTimeTravelStoreForTests();
  });
});

describe("US DST civil day length", () => {
  it("uses 25 hours on 2026-11-01 fall-back in Denver and New York", () => {
    expect(civilHourSlotCount(fallBackDenver, denver)).toBe(25);
    expect(civilHourSlotCount(fallBackDenver, newYork)).toBe(25);
  });

  it("uses 23 hours on 2027-03-14 spring-forward in Denver and New York", () => {
    expect(civilHourSlotCount(springForwardDenver, denver)).toBe(23);
    expect(civilHourSlotCount(springForwardDenver, newYork)).toBe(23);
  });
});

describe("event positioning on DST days", () => {
  it("keeps 9 AM on the same row before and after fall-back", () => {
    act(() => setPinnedTimeZone(denver));

    const beforeDst = getTimedEventPosition(
      {
        endDate: "2026-10-29T10:00:00-06:00",
        isAllDay: false,
        position: { widthMultiplier: 1 },
        startDate: "2026-10-29T09:00:00-06:00",
      } as never,
      {
        measurements,
        visibleDates: visibleDenverDates("2026-10-29"),
        isDraft: false,
      },
    ).top;

    const afterDst = getTimedEventPosition(
      {
        endDate: "2026-11-05T10:00:00-07:00",
        isAllDay: false,
        position: { widthMultiplier: 1 },
        startDate: "2026-11-05T09:00:00-07:00",
      } as never,
      {
        measurements,
        visibleDates: visibleDenverDates("2026-11-05"),
        isDraft: false,
      },
    ).top;

    expect(beforeDst).toBe(8 * measurements.hourHeight);
    expect(afterDst).toBe(8 * measurements.hourHeight);
  });

  it("preserves duration in minutes across spring-forward week", () => {
    act(() => setPinnedTimeZone(denver));

    const position = getTimedEventPosition(
      {
        endDate: "2027-03-14T10:00:00-06:00",
        isAllDay: false,
        position: { widthMultiplier: 1 },
        startDate: "2027-03-14T09:00:00-06:00",
      } as never,
      {
        measurements,
        visibleDates: visibleDenverDates("2027-03-14"),
        isDraft: false,
      },
    );

    expect(position.top).toBe(8 * measurements.hourHeight);
    expect(position.height).toBeGreaterThan(0);
    expect(position.height).toBe(60 - 3);
  });
});

describe("now line and hour labels", () => {
  it("uses civil day length for the now-line on fall-back morning", () => {
    act(() => setPinnedTimeZone(denver));
    setSystemTime(new Date("2026-11-01T15:00:00.000Z"));

    const percent = getCurrentPercentOfDay(denver);
    const minutes = 9 * 60;
    const expected =
      (minutes / civilDayLengthMinutes(fallBackDenver, denver)) * 100;
    expect(percent).toBeCloseTo(expected, 5);
  });

  it("renders 25 hour grid rows on fall-back and 23 on spring-forward", () => {
    expect(getHourLabels(true, fallBackDenver, denver)).toHaveLength(25);
    expect(getHourLabels(true, springForwardDenver, denver)).toHaveLength(23);
  });

  it("maps secondary timezone labels with DST-aware slot count", () => {
    act(() => {
      setPinnedTimeZone(newYork);
      setTimeTravelZone(denver);
    });

    const labels = mappedHourLabels(newYork, denver, fallBackDenver);
    expect(labels).toHaveLength(24);
  });
});

describe("grid click intent on DST days", () => {
  it("maps y position with fall-back civil length", () => {
    act(() => setPinnedTimeZone(denver));

    const civilMinutes = civilDayLengthMinutes(fallBackDenver, denver);
    const yForNineAm = (540 / civilMinutes) * 1500;
    const grid = {
      scrollHeight: 1500,
      scrollTop: 0,
      getBoundingClientRect: () => ({ top: 0 }),
    } as unknown as HTMLElement;

    const previousGetElementById = document.getElementById.bind(document);
    document.getElementById = (id: string) =>
      id === "mainGrid" ? grid : previousGetElementById(id);

    try {
      const intent = timedIntentAt(fallBackDenver, yForNineAm);
      expect(intent?.start).toContain("T09:00:00");
    } finally {
      document.getElementById = previousGetElementById;
    }
  });
});

describe("recurring events across DST", () => {
  it("keeps 9 AM Denver on weekly occurrences after fall-back", () => {
    act(() => setPinnedTimeZone(denver));

    const start = dayjs.tz("2026-10-22T09:00:00", denver);
    const rrule = new CompassEventRRule(
      {
        _id: new ObjectId(),
        startDate: start.format(),
        endDate: start.add(1, "hour").format(),
        isAllDay: false,
        recurrence: { rule: ["RRULE:FREQ=WEEKLY;COUNT=3"] },
      } as never,
      { tzid: denver },
    );

    const afterFallback = rrule
      .all()
      .map((occurrence) => dayjs(occurrence).tz(denver).format("HH:mm Z"));
    expect(afterFallback).toEqual([
      "09:00 -06:00",
      "09:00 -06:00",
      "09:00 -07:00",
    ]);
  });
});

describe("schedule display offsets", () => {
  it("re-anchors stored instants to the zone offset for the civil date", () => {
    const formatted = formatInstantInTimeZone(
      "2026-11-05T16:00:00.000Z",
      denver,
    );
    expect(formatted).toBe("2026-11-05T09:00:00-07:00");
  });
});

describe("pinned calendar timezone with a mismatched browser zone", () => {
  it("places Denver wall-clock times on the correct row when the browser is UTC", () => {
    act(() => {
      setBrowserTimeZoneForTests("UTC");
      setPinnedTimeZone(denver);
    });

    const wakeTop = getTimedEventPosition(
      {
        endDate: "2026-11-05T05:00:00-07:00",
        isAllDay: false,
        position: { widthMultiplier: 1 },
        startDate: "2026-11-05T04:00:00-07:00",
      } as never,
      {
        measurements,
        visibleDates: visibleDenverDates("2026-11-05"),
        isDraft: false,
      },
    ).top;

    const sundayWakeTop = getTimedEventPosition(
      {
        endDate: "2026-11-01T05:00:00-07:00",
        isAllDay: false,
        position: { widthMultiplier: 1 },
        startDate: "2026-11-01T04:00:00-07:00",
      } as never,
      {
        measurements,
        visibleDates: visibleDenverDates("2026-11-01"),
        isDraft: false,
      },
    ).top;

    expect(wakeTop).toBe(3 * measurements.hourHeight);
    expect(sundayWakeTop).toBe(3 * measurements.hourHeight);
  });
});

describe("Europe/London DST weeks", () => {
  const visibleLondon = (dayKey: string) => [
    { date: dayjs.tz(`${dayKey}T12:00`, london), key: dayKey },
  ];

  it("aligns 9 AM on fall-back and spring-forward weeks", () => {
    act(() => {
      setBrowserTimeZoneForTests("UTC");
      setPinnedTimeZone(london);
    });

    const fallBackTop = getTimedEventPosition(
      {
        endDate: "2026-10-26T10:00:00+00:00",
        isAllDay: false,
        position: { widthMultiplier: 1 },
        startDate: "2026-10-26T09:00:00+00:00",
      } as never,
      {
        measurements,
        visibleDates: visibleLondon("2026-10-26"),
        isDraft: false,
      },
    ).top;

    const springForwardTop = getTimedEventPosition(
      {
        endDate: "2027-03-29T10:00:00+01:00",
        isAllDay: false,
        position: { widthMultiplier: 1 },
        startDate: "2027-03-29T09:00:00+01:00",
      } as never,
      {
        measurements,
        visibleDates: visibleLondon("2027-03-29"),
        isDraft: false,
      },
    ).top;

    expect(fallBackTop).toBe(8 * measurements.hourHeight);
    expect(springForwardTop).toBe(8 * measurements.hourHeight);
  });
});

describe("scroll-to-now on spring-forward day", () => {
  it("scrolls using civil minutes, not a fixed 1440", () => {
    act(() => setPinnedTimeZone(denver));
    setSystemTime(new Date("2027-03-14T16:00:00.000Z"));

    const clientHeight = 780;
    const scrollTop = getScrollToNowTop(clientHeight);
    expect(scrollTop).toBeGreaterThan(0);
  });
});
