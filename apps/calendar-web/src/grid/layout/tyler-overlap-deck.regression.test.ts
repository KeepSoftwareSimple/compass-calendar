import dayjs from "@core/util/date/dayjs";
import { DECK_INDENT } from "@web/grid/grid.constants";
import { getTimedEventPosition } from "@web/grid/layout/event.position";
import {
  applyTimedEventDisplayPosition,
  createTimedEventLayout,
} from "@web/grid/layout/timed-deck.layout";
import { createTimedEventLayoutPre4905 } from "@web/grid/layout/timed-deck.layout.legacy";
import {
  tylerOct31OverlapGridEvents,
  tylerOct31OverlapGridEventsLegacy,
} from "@web/grid/layout/tyler-overlap.fixture";
import {
  resetEffectiveTimeZoneStoreForTests,
  setBrowserTimeZoneForTests,
  setPinnedTimeZone,
} from "@web/timezone/effective-timezone.store";
import { afterEach, describe, expect, it } from "bun:test";

const denver = "America/Denver";

afterEach(() => {
  resetEffectiveTimeZoneStoreForTests();
});

describe("Tyler Oct 31 overlap deck regression (#4905)", () => {
  it("pre-4905 layout leaves same-start cards stacked at full width under a UTC host", () => {
    setBrowserTimeZoneForTests("Etc/UTC");
    setPinnedTimeZone(denver);

    const events = tylerOct31OverlapGridEventsLegacy();
    const legacy = createTimedEventLayoutPre4905(events);
    const ritualLegacy = legacy.find(
      (item) => item.event._id === "tyler-ritual",
    );
    const unwindLegacy = legacy.find(
      (item) => item.event._id === "tyler-unwind",
    );

    expect(ritualLegacy?.deckLayout).toBeNull();
    expect(unwindLegacy?.deckLayout).toBeNull();

    const measurements = {
      allDayRow: null,
      colWidths: [140, 140, 140, 140, 140, 140, 140],
      hourHeight: 60,
      mainGrid: { height: 1440 } as never,
    };
    const visibleDates = Array.from({ length: 7 }, (_, index) => {
      const date = dayjs.tz("2026-10-26", denver).add(index, "day");
      return { date, key: date.format("YYYY-MM-DD") };
    });
    const columnIndex = 6;

    const ritualPos = applyTimedEventDisplayPosition(
      getTimedEventPosition(events[0], {
        columnIndex,
        isDraft: false,
        measurements,
        visibleDates,
      }),
      null,
    );
    const unwindPos = applyTimedEventDisplayPosition(
      getTimedEventPosition(events[1], {
        columnIndex,
        isDraft: false,
        measurements,
        visibleDates,
      }),
      null,
    );

    expect(ritualPos.left).toBe(unwindPos.left);
    expect(ritualPos.width).toBe(unwindPos.width);
  });

  it("current layout fans the overlap under a UTC host with Denver pinned", () => {
    setBrowserTimeZoneForTests("Etc/UTC");
    setPinnedTimeZone(denver);

    const events = tylerOct31OverlapGridEvents();
    const laid = createTimedEventLayout(events);
    const ritual = laid.find((item) => item.event._id === "tyler-ritual");
    const unwind = laid.find((item) => item.event._id === "tyler-unwind");

    expect(ritual?.deckLayout).toEqual({ order: 0, groupSize: 2 });
    expect(unwind?.deckLayout).toEqual({ order: 1, groupSize: 2 });

    const measurements = {
      allDayRow: null,
      colWidths: [140, 140, 140, 140, 140, 140, 140],
      hourHeight: 60,
      mainGrid: { height: 1440 } as never,
    };
    const visibleDates = Array.from({ length: 7 }, (_, index) => {
      const date = dayjs.tz("2026-10-26", denver).add(index, "day");
      return { date, key: date.format("YYYY-MM-DD") };
    });
    const columnIndex = 6;

    const ritualPos = applyTimedEventDisplayPosition(
      getTimedEventPosition(events[0], {
        columnIndex,
        isDraft: false,
        measurements,
        visibleDates,
      }),
      ritual?.deckLayout ?? null,
    );
    const unwindPos = applyTimedEventDisplayPosition(
      getTimedEventPosition(events[1], {
        columnIndex,
        isDraft: false,
        measurements,
        visibleDates,
      }),
      unwind?.deckLayout ?? null,
    );

    expect(unwindPos.left - ritualPos.left).toBeGreaterThan(DECK_INDENT);
    expect(unwindPos.width).toBe(ritualPos.width);
  });
});
