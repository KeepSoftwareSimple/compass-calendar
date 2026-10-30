import { gridMinutesFromCivilMidnight } from "@core/util/date/civil-day";
import dayjs from "@core/util/date/dayjs";
import { DRAFT_PADDING_BOTTOM } from "@web/grid/grid.constants";
import { getTimedEventPosition } from "@web/grid/layout/event.position";
import {
  gridEventsFromProdOverlapExport,
  type ProdOverlapExportInstance,
} from "@web/grid/layout/prod-overlap-export.fixture";
import { createTimedEventLayout } from "@web/grid/layout/timed-deck.layout";
import {
  resetEffectiveTimeZoneStoreForTests,
  setBrowserTimeZoneForTests,
  setCalendarTimeZoneHint,
  setPinnedTimeZone,
} from "@web/timezone/effective-timezone.store";
import { parseGridScheduleDate } from "@web/timezone/parse-grid-schedule-date";
import { afterEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const denver = "America/Denver";
const hourHeight = 60;

/** Denver civil start/end minutes derived from the scrubbed prod export instants. */
const expectedDenverMinutesByEventId: Record<
  string,
  { start: number; end: number }
> = {
  "58bfb78bcb937dfe721da488": { start: 6 * 60, end: 7 * 60 },
  "6ada47f4064b6306e1fd76fe": { start: 8 * 60, end: 11 * 60 },
  "6aced1f2b4515f656d930fbe": { start: 14 * 60, end: 17 * 60 },
  "6a6a3234a3f00a3867f615e1": { start: 12 * 60, end: 13 * 60 + 30 },
  "6a8313927f0219811f36f89a": { start: 12 * 60, end: 13 * 60 + 30 },
  "6ae222d0975a6404abf9c624": { start: 16 * 60, end: 18 * 60 },
  a0a09611e0b4294c26f2f10a: { start: 19 * 60, end: 20 * 60 },
  "3d4f8155502403b165fa55d2": { start: 18 * 60 + 30, end: 19 * 60 },
  "6a8db82c1155fcd5223bd262": { start: 19 * 60 + 30, end: 20 * 60 },
};

const prodExportFixture = (): ProdOverlapExportInstance[] => {
  const path = join(
    import.meta.dir,
    "fixtures",
    "tyler-prod-overlap-2026-10-31.json",
  );
  const payload = JSON.parse(readFileSync(path, "utf8")) as {
    instances: ProdOverlapExportInstance[];
  };
  return payload.instances;
};

const overlapMeasurements = {
  allDayRow: null,
  colWidths: [140],
  hourHeight,
  mainGrid: { height: 1440 } as never,
};

const oct31VisibleDates = [
  { date: dayjs.tz("2026-10-31", denver), key: "2026-10-31" },
];

afterEach(() => {
  resetEffectiveTimeZoneStoreForTests();
});

describe("prod overlap export → grid deck layout", () => {
  it("places every export card at its Denver civil time on a pinned Denver calendar", () => {
    setBrowserTimeZoneForTests("Etc/UTC");
    setCalendarTimeZoneHint(denver);
    setPinnedTimeZone(denver);

    const gridEvents = gridEventsFromProdOverlapExport(prodExportFixture());

    for (const event of gridEvents) {
      const expected = expectedDenverMinutesByEventId[event._id];
      expect(expected).toBeDefined();

      const eventZone = event.timeZone ?? denver;
      const start = parseGridScheduleDate(event.startDate, eventZone);
      const end = parseGridScheduleDate(event.endDate, eventZone);
      const startMinutes = gridMinutesFromCivilMidnight(start, denver);
      const endMinutes = gridMinutesFromCivilMidnight(end, denver);

      expect(startMinutes).toBe(expected!.start);
      expect(endMinutes).toBe(expected!.end);

      const position = getTimedEventPosition(event, {
        columnIndex: 0,
        isDraft: false,
        measurements: overlapMeasurements,
        visibleDates: oct31VisibleDates,
      });

      const durationMinutes = Math.max(15, end.diff(start, "minute"));
      const expectedTop = (Math.max(0, expected!.start - 60) / 60) * hourHeight;
      const expectedHeight =
        (durationMinutes / 60) * hourHeight - DRAFT_PADDING_BOTTOM;

      expect(position.top).toBe(expectedTop);
      expect(position.height).toBe(expectedHeight);
    }
  });

  it("fans only real Denver-time overlaps; rituals stay at midday away from Unwind", () => {
    setBrowserTimeZoneForTests("Etc/UTC");
    setCalendarTimeZoneHint(denver);
    setPinnedTimeZone(denver);

    const gridEvents = gridEventsFromProdOverlapExport(prodExportFixture());
    const laid = createTimedEventLayout(gridEvents);

    const byId = (id: string) => laid.find((item) => item.event._id === id);

    const unwind = byId("a0a09611e0b4294c26f2f10a");
    const update730 = byId("6a8db82c1155fcd5223bd262");
    const update630 = byId("3d4f8155502403b165fa55d2");
    const ritualA = byId("6a6a3234a3f00a3867f615e1");
    const ritualB = byId("6a8313927f0219811f36f89a");
    const festival = byId("6aced1f2b4515f656d930fbe");
    const demo = byId("6ae222d0975a6404abf9c624");

    expect(unwind?.deckLayout?.groupSize).toBe(2);
    expect(update730?.deckLayout?.groupSize).toBe(2);
    expect(unwind?.deckLayout?.order).not.toBe(update730?.deckLayout?.order);

    expect(update630?.deckLayout).toBeNull();
    expect(ritualA?.deckLayout?.groupSize).toBe(2);
    expect(ritualB?.deckLayout?.groupSize).toBe(2);
    expect(festival?.deckLayout?.groupSize).toBe(2);
    expect(demo?.deckLayout?.groupSize).toBe(2);

    const unwindPos = getTimedEventPosition(unwind!.event, {
      columnIndex: 0,
      isDraft: false,
      measurements: overlapMeasurements,
      visibleDates: oct31VisibleDates,
    });
    const ritualPos = getTimedEventPosition(ritualA!.event, {
      columnIndex: 0,
      isDraft: false,
      measurements: overlapMeasurements,
      visibleDates: oct31VisibleDates,
    });

    expect(ritualPos.top).toBeLessThan(unwindPos.top - 120);
    expect(ritualPos.top).toBe(((12 * 60 - 60) / 60) * hourHeight);
    expect(unwindPos.top).toBe(((19 * 60 - 60) / 60) * hourHeight);
  });
});
