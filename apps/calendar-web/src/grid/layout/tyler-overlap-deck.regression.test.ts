import dayjs from "@core/util/date/dayjs";
import { DECK_CASCADE_INDENT_RATIO } from "@web/grid/grid.constants";
import { getTimedEventPosition } from "@web/grid/layout/event.position";
import {
  applyTimedEventDisplayPosition,
  createTimedEventLayout,
} from "@web/grid/layout/timed-deck.layout";
import {
  tylerOct31OverlapGridEvents,
  tylerOct31OverlapGridEventsInvertedEnd,
  tylerOct31OverlapGridEventsLegacy,
} from "@web/grid/layout/tyler-overlap.fixture";
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
    const ritual = laid.find((item) => item.event._id === "tyler-ritual");
    const demo = laid.find((item) => item.event._id === "tyler-compass-demo");
    const festival = laid.find(
      (item) => item.event._id === "tyler-fall-festival",
    );

    expect(unwind?.deckLayout?.groupSize).toBe(2);
    expect(ritual?.deckLayout?.groupSize).toBe(2);
    expect(unwind?.deckLayout?.left).not.toBe(ritual?.deckLayout?.left);
    // The demo starts 30 minutes into the festival, so it cascades over it.
    expect(festival?.deckLayout).toMatchObject({ groupSize: 2, left: 0 });
    expect(demo?.deckLayout).toMatchObject({
      groupSize: 2,
      left: DECK_CASCADE_INDENT_RATIO,
    });

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

    const ritualEvent = events.find((event) => event._id === "tyler-ritual");
    const unwindEvent = events.find((event) => event._id === "tyler-unwind");
    expect(ritualEvent).toBeDefined();
    expect(unwindEvent).toBeDefined();

    const ritualPos = applyTimedEventDisplayPosition(
      getTimedEventPosition(ritualEvent!, {
        columnIndex,
        isDraft: false,
        measurements,
        visibleDates,
      }),
      ritual?.deckLayout ?? null,
    );
    const unwindPos = applyTimedEventDisplayPosition(
      getTimedEventPosition(unwindEvent!, {
        columnIndex,
        isDraft: false,
        measurements,
        visibleDates,
      }),
      unwind?.deckLayout ?? null,
    );

    expect(unwindPos.width).toBe(ritualPos.width);
    expect(Math.abs(unwindPos.left - ritualPos.left)).toBe(unwindPos.width);
  });

  it("groups Unwind with ritual when naive end parses before Z start (prod Oct 31)", () => {
    setBrowserTimeZoneForTests("Etc/UTC");
    setCalendarTimeZoneHint(denver);
    setPinnedTimeZone(denver);

    const laid = createTimedEventLayout(
      tylerOct31OverlapGridEventsInvertedEnd(),
    );
    const unwind = laid.find((item) => item.event._id === "tyler-unwind");
    const ritual = laid.find((item) => item.event._id === "tyler-ritual");

    expect(unwind?.deckLayout?.groupSize).toBe(2);
    expect(ritual?.deckLayout?.groupSize).toBe(2);
    expect(unwind?.deckLayout?.left).not.toBe(ritual?.deckLayout?.left);
  });

  it("groups legacy naive ritual end with Unwind on a UTC host", () => {
    setBrowserTimeZoneForTests("Etc/UTC");
    setCalendarTimeZoneHint(denver);
    setPinnedTimeZone(denver);

    const laid = createTimedEventLayout(tylerOct31OverlapGridEventsLegacy());
    const unwind = laid.find((item) => item.event._id === "tyler-unwind");
    const ritual = laid.find((item) => item.event._id === "tyler-ritual");

    expect(unwind?.deckLayout?.groupSize).toBe(2);
    expect(ritual?.deckLayout?.groupSize).toBe(2);
    expect(unwind?.deckLayout?.left).not.toBe(ritual?.deckLayout?.left);
  });
});
