import { act } from "react";
import dayjs from "@core/util/date/dayjs";
import { getHourLabels } from "@web/common/utils/datetime/web.date.util";
import { getTimedEventPosition } from "@web/grid/layout/event.position";
import {
  resetEffectiveTimeZoneStoreForTests,
  setBrowserTimeZoneForTests,
  setPinnedTimeZone,
} from "@web/timezone/effective-timezone.store";
import { afterEach, describe, expect, it } from "bun:test";

// CI runs web tests with TZ=Etc/UTC, but real browsers run in the user's own
// zone. The dayjs timezone plugin leaks the host zone into `startOf` and `add`,
// which once shifted the whole fall-back week gutter by an hour for US users
// (a 7 PM event sat next to the "6 PM" label). Pin the host zone here so this
// suite fails if that ever comes back.
const denver = "America/Denver";
const hourHeight = 60;
const hostZones = ["Etc/UTC", "America/Denver", "America/New_York"] as const;
const originalTz = process.env.TZ;

const fallBackWeekLabels = [
  "1 AM",
  "2 AM",
  "3 AM",
  "4 AM",
  "5 AM",
  "6 AM",
  "7 AM",
  "8 AM",
  "9 AM",
  "10 AM",
  "11 AM",
  "12 PM",
  "1 PM",
  "2 PM",
  "3 PM",
  "4 PM",
  "5 PM",
  "6 PM",
  "7 PM",
  "8 PM",
  "9 PM",
  "10 PM",
  "11 PM",
  "12 AM",
  "1 AM",
];

const topRowOf = (dayKey: string, startAt: string, endAt: string): number =>
  getTimedEventPosition(
    {
      endDate: endAt,
      isAllDay: false,
      position: { widthMultiplier: 1 },
      startDate: startAt,
    } as never,
    {
      measurements: {
        allDayRow: null,
        colWidths: [320],
        hourHeight,
        mainGrid: { height: hourHeight * 13 } as never,
      },
      visibleDates: [
        { date: dayjs.tz(`${dayKey}T12:00`, denver), key: dayKey },
      ],
      isDraft: false,
    },
  ).top / hourHeight;

afterEach(() => {
  process.env.TZ = originalTz;
  act(() => resetEffectiveTimeZoneStoreForTests());
});

describe("fall-back week gutter in any host time zone", () => {
  for (const hostZone of hostZones) {
    it(`labels the Nov 1-7 2026 Denver gutter in wall-clock order on a ${hostZone} host`, () => {
      process.env.TZ = hostZone;
      act(() => {
        setBrowserTimeZoneForTests(denver);
        setPinnedTimeZone(null);
      });

      expect(getHourLabels(true, "2026-11-01", denver)).toEqual(
        fallBackWeekLabels,
      );
    });

    it(`puts a 7 PM event on the 7 PM gutter line on a ${hostZone} host`, () => {
      process.env.TZ = hostZone;
      act(() => {
        setBrowserTimeZoneForTests(denver);
        setPinnedTimeZone(null);
      });

      const labels = getHourLabels(true, "2026-11-01", denver);
      for (const dayKey of ["2026-11-01", "2026-11-03", "2026-11-07"]) {
        const row = topRowOf(
          dayKey,
          `${dayKey}T19:00:00-07:00`,
          `${dayKey}T20:00:00-07:00`,
        );
        // In the fall-back week labels[0] ("1 AM") sits at y=0, so row r is labels[r].
        expect(labels[row]).toBe("7 PM");
      }
    });
  }
});
