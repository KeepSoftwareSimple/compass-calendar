import dayjs from "@core/util/date/dayjs";
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
import { afterEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const denver = "America/Denver";

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

afterEach(() => {
  resetEffectiveTimeZoneStoreForTests();
});

describe("prod overlap export → grid deck layout", () => {
  it("uses Tyler prod Oct 31 scrubbed export shape", () => {
    setBrowserTimeZoneForTests("Etc/UTC");
    setCalendarTimeZoneHint(denver);
    setPinnedTimeZone(denver);

    const gridEvents = gridEventsFromProdOverlapExport(prodExportFixture());
    const laid = createTimedEventLayout(gridEvents);

    const unwind = laid.find((item) => item.event.title === "Unwind");
    const eveningUpdate = laid.find(
      (item) =>
        item.event.title === "Update 4e2d" &&
        item.event.startDate.includes("19:30"),
    );
    expect(unwind?.deckLayout?.groupSize).toBe(2);
    expect(eveningUpdate?.deckLayout?.groupSize).toBe(2);
    expect(unwind?.deckLayout?.order).not.toBe(
      eveningUpdate?.deckLayout?.order,
    );

    const measurements = {
      allDayRow: null,
      colWidths: [140],
      hourHeight: 60,
      mainGrid: { height: 1440 } as never,
    };
    const visibleDates = [
      { date: dayjs.tz("2026-10-31", denver), key: "2026-10-31" },
    ];
    const ritualEvent = gridEvents.find(
      (event) => event._id === "6a6a3234a3f00a3867f615e1",
    );
    const unwindEvent = gridEvents.find((event) => event.title === "Unwind");
    expect(ritualEvent).toBeDefined();
    expect(unwindEvent).toBeDefined();

    const ritualPos = getTimedEventPosition(ritualEvent!, {
      columnIndex: 0,
      isDraft: false,
      measurements,
      visibleDates,
    });
    const unwindPos = getTimedEventPosition(unwindEvent!, {
      columnIndex: 0,
      isDraft: false,
      measurements,
      visibleDates,
    });

    expect(ritualPos.top).toBeLessThan(unwindPos.top - 120);
  });
});
