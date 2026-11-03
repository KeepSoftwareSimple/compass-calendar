import dayjs from "@core/util/date/dayjs";
import { type GridEvent } from "@web/common/types/web.event.types";
import {
  DECK_CASCADE_INDENT_RATIO,
  DECK_NEAR_START_MINUTES,
  TIMED_EVENT_COLUMN_INSET,
} from "@web/grid/grid.constants";
import { getTimedEventPosition } from "@web/grid/layout/event.position";
import {
  type ReadabilityCard,
  scoreReadability,
  visibleTitleWidths,
} from "@web/grid/layout/overlap-scenarios/overlap-readability";
import {
  OVERLAP_SCENARIO_COLUMN_WIDTHS,
  OVERLAP_SCENARIO_DAY,
  OVERLAP_SCENARIO_ZONE,
  OVERLAP_SCENARIOS,
  type OverlapScenario,
  type OverlapScenarioColumnWidth,
  overlapScenarioGridEvents,
} from "@web/grid/layout/overlap-scenarios/overlap-scenarios";
import {
  gridEventsFromProdOverlapExport,
  type ProdOverlapExportInstance,
} from "@web/grid/layout/prod-overlap-export.fixture";
import {
  applyTimedEventDisplayPosition,
  createTimedEventLayout,
  type TimedEventLayoutItem,
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
import { parseGridScheduleDate } from "@web/timezone/parse-grid-schedule-date";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Readability guard for the overlap deck. Every scenario runs at every
 * column width against the same invariants, so a fix for one overlap shape
 * cannot quietly make another one unreadable (see issue #5057 for how the
 * Oct 29 equal-slice layout regressed the chain and background cases).
 */

const EPSILON = 0.001;

interface LaidCard extends ReadabilityCard {
  startMinute: number;
}

const laidCards = (
  items: TimedEventLayoutItem[],
  columnWidth: number,
  dayKey: string,
): LaidCard[] => {
  const measurements = {
    allDayRow: null,
    colWidths: [columnWidth],
    hourHeight: 60,
    mainGrid: { height: 1440 } as never,
  };
  const visibleDates = [
    { date: dayjs.tz(dayKey, OVERLAP_SCENARIO_ZONE), key: dayKey },
  ];
  return items.map((item) => {
    const base = getTimedEventPosition(item.event, {
      columnIndex: 0,
      isDraft: false,
      measurements,
      visibleDates,
    });
    const position = applyTimedEventDisplayPosition(
      base,
      item.deckLayout,
      item.isHidden,
    );
    const start = parseGridScheduleDate(
      item.event.startDate,
      item.event.timeZone ?? OVERLAP_SCENARIO_ZONE,
    );
    return {
      height: position.height,
      id: item.event._id ?? item.event.title ?? "",
      left: position.left,
      startMinute: start.valueOf() / 60_000,
      top: position.top,
      width: position.width,
      zIndex: position.zIndex ?? 1,
    };
  });
};

const overlapsVertically = (a: LaidCard, b: LaidCard) =>
  a.top < b.top + b.height && a.top + a.height > b.top;

const disjointHorizontally = (a: LaidCard, b: LaidCard) =>
  a.left + a.width <= b.left + EPSILON || b.left + b.width <= a.left + EPSILON;

const expectInvariants = (cards: LaidCard[], columnWidth: number) => {
  const usableLeft = TIMED_EVENT_COLUMN_INSET;
  const usableWidth = columnWidth - TIMED_EVENT_COLUMN_INSET * 2;
  const indentPx = usableWidth * DECK_CASCADE_INDENT_RATIO;
  const visible = visibleTitleWidths(cards);

  for (const card of cards) {
    // 1. Inside the usable column.
    expect(card.left).toBeGreaterThanOrEqual(usableLeft - EPSILON);
    expect(card.left + card.width).toBeLessThanOrEqual(
      usableLeft + usableWidth + EPSILON,
    );
    expect(card.width).toBeGreaterThan(0);

    for (const other of cards) {
      if (other === card || !overlapsVertically(card, other)) continue;
      const gapMinutes = other.startMinute - card.startMinute;

      // 2. Near starts never cover each other.
      if (Math.abs(gapMinutes) < DECK_NEAR_START_MINUTES) {
        expect(disjointHorizontally(card, other)).toBe(true);
      }

      // 3. A card started well before a later one keeps its indent of title.
      if (gapMinutes >= DECK_NEAR_START_MINUTES) {
        expect(visible.get(card.id) ?? 0).toBeGreaterThanOrEqual(
          Math.min(card.width, indentPx) - EPSILON,
        );
      }
    }
  }
};

const expectFloor = (
  cards: LaidCard[],
  scenario: OverlapScenario,
  columnWidth: OverlapScenarioColumnWidth,
) => {
  const score = scoreReadability(visibleTitleWidths(cards).values());
  const floor = scenario.floors[columnWidth];
  expect(score.good).toBeGreaterThanOrEqual(floor.good);
  expect(score.poor).toBeLessThanOrEqual(floor.poor);
};

afterEach(() => {
  resetEffectiveTimeZoneStoreForTests();
});

describe("overlap scenarios", () => {
  beforeEach(() => {
    setBrowserTimeZoneForTests(OVERLAP_SCENARIO_ZONE);
    setPinnedTimeZone(OVERLAP_SCENARIO_ZONE);
  });

  for (const scenario of OVERLAP_SCENARIOS) {
    for (const columnWidth of OVERLAP_SCENARIO_COLUMN_WIDTHS) {
      it(`${scenario.id} stays readable at ${columnWidth}px`, () => {
        const items = createTimedEventLayout(
          overlapScenarioGridEvents(scenario),
        );
        const cards = laidCards(items, columnWidth, OVERLAP_SCENARIO_DAY);

        expectInvariants(cards, columnWidth);
        expectFloor(cards, scenario, columnWidth);
      });
    }

    it(`${scenario.id} lays out hidden events as if they were absent`, () => {
      const events = overlapScenarioGridEvents(scenario);
      const hidden = events[events.length - 1];

      const withHidden = createTimedEventLayout(
        events,
        new Set([hidden._id as string]),
      ).filter((item) => !item.isHidden);
      const without = createTimedEventLayout(
        events.filter((event) => event !== hidden),
      );

      expect(withHidden.map((item) => item.deckLayout)).toEqual(
        without.map((item) => item.deckLayout),
      );
    });
  }
});

describe("overlap scenarios from prod shapes", () => {
  const denver = "America/Denver";
  const oct31 = "2026-10-31";

  beforeEach(() => {
    setBrowserTimeZoneForTests("Etc/UTC");
    setCalendarTimeZoneHint(denver);
    setPinnedTimeZone(denver);
  });

  const prodExport = (): GridEvent[] => {
    const path = join(
      import.meta.dir,
      "..",
      "fixtures",
      "tyler-prod-overlap-2026-10-31.json",
    );
    const payload = JSON.parse(readFileSync(path, "utf8")) as {
      instances: ProdOverlapExportInstance[];
    };
    return gridEventsFromProdOverlapExport(payload.instances);
  };

  const fixtures: Record<string, () => GridEvent[]> = {
    "Tyler Oct 31": tylerOct31OverlapGridEvents,
    "Tyler Oct 31 inverted end": tylerOct31OverlapGridEventsInvertedEnd,
    "Tyler Oct 31 legacy": tylerOct31OverlapGridEventsLegacy,
    "prod export Oct 31": prodExport,
  };

  for (const [name, events] of Object.entries(fixtures)) {
    for (const columnWidth of OVERLAP_SCENARIO_COLUMN_WIDTHS) {
      it(`${name} holds the invariants at ${columnWidth}px`, () => {
        const cards = laidCards(
          createTimedEventLayout(events()),
          columnWidth,
          oct31,
        );

        expectInvariants(cards, columnWidth);
        expect(scoreReadability(visibleTitleWidths(cards).values()).poor).toBe(
          0,
        );
      });
    }
  }
});
