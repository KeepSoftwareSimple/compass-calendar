import dayjs from "@core/util/date/dayjs";
import { getTimedEventPosition } from "@web/grid/layout/event.position";
import {
  applyTimedEventDisplayPosition,
  createTimedEventLayout,
} from "@web/grid/layout/timed-deck.layout";
import { tylerOct31OverlapGridEvents } from "@web/grid/layout/tyler-overlap.fixture";
import {
  resetEffectiveTimeZoneStoreForTests,
  setBrowserTimeZoneForTests,
  setCalendarTimeZoneHint,
  setPinnedTimeZone,
} from "@web/timezone/effective-timezone.store";
import { afterEach, describe, expect, it } from "bun:test";

const denver = "America/Denver";

afterEach(() => {
  resetEffectiveTimeZoneStoreForTests();
});

describe("Tyler Oct 31 overlap deck regression", () => {
  it("groups evening overlaps and splits the column under a UTC host with Denver pinned", () => {
    setBrowserTimeZoneForTests("Etc/UTC");
    setCalendarTimeZoneHint(denver);
    setPinnedTimeZone(denver);

    const events = tylerOct31OverlapGridEvents();
    const laid = createTimedEventLayout(events);

    const unwind = laid.find((item) => item.event._id === "tyler-unwind");
    const deutsch = laid.find((item) => item.event._id === "tyler-deutsch");
    const demo = laid.find((item) => item.event._id === "tyler-compass-demo");
    const festival = laid.find(
      (item) => item.event._id === "tyler-fall-festival",
    );

    expect(unwind?.deckLayout).toEqual({ order: 0, groupSize: 2 });
    expect(deutsch?.deckLayout).toEqual({ order: 1, groupSize: 2 });
    expect(demo?.deckLayout).toEqual({ order: 1, groupSize: 2 });
    expect(festival?.deckLayout).toEqual({ order: 0, groupSize: 2 });

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
    const columnIndex = 5;

    const deutschPos = applyTimedEventDisplayPosition(
      getTimedEventPosition(events[4], {
        columnIndex,
        isDraft: false,
        measurements,
        visibleDates,
      }),
      deutsch?.deckLayout ?? null,
    );
    const unwindPos = applyTimedEventDisplayPosition(
      getTimedEventPosition(events[3], {
        columnIndex,
        isDraft: false,
        measurements,
        visibleDates,
      }),
      unwind?.deckLayout ?? null,
    );

    expect(unwindPos.width).toBe(deutschPos.width);
    expect(deutschPos.left).toBe(unwindPos.left + unwindPos.width);
  });
});
