import { Origin } from "@core/constants/core.constants";
import { type GridEvent } from "@web/common/types/web.event.types";
import { gridEventDefaultPosition } from "@web/common/utils/event/event.util";
import {
  DECK_INDENT,
  DECK_MIN_WIDTH,
  DECK_RIGHT_RESERVE,
  EVENT_WIDTH_MINIMUM,
  HIDDEN_EVENT_STRIP_WIDTH,
  TIMED_EVENT_COLUMN_INSET,
  TIMED_EVENT_FAN_GUTTER,
  TIMED_EVENT_FAN_INDENT,
  TIMED_EVENT_WIDTH_RATIO,
} from "@web/grid/grid.constants";
import {
  applyTimedDeckPosition,
  applyTimedEventDisplayPosition,
  createTimedEventLayout,
} from "./timed-deck.layout";

const createTimedEvent = (
  overrides: Partial<GridEvent> & {
    _id: string;
    startDate: string;
    endDate: string;
  },
): GridEvent => ({
  isAllDay: false,
  origin: Origin.COMPASS,
  recurrence: undefined,
  title: overrides._id,
  user: "user",
  ...overrides,
  position: { ...gridEventDefaultPosition, ...overrides.position },
});

const event = (id: string, startDate: string, endDate: string) =>
  createTimedEvent({
    _id: id,
    endDate,
    startDate,
  });

const deckOf = (items: ReturnType<typeof createTimedEventLayout>, id: string) =>
  items.find((item) => item.event._id === id)?.deckLayout ?? null;

describe("createTimedEventLayout", () => {
  it("decks overlapping events in a one-date calendar", () => {
    const items = createTimedEventLayout([
      event("first", "2026-05-20T09:00:00", "2026-05-20T10:00:00"),
      event("second", "2026-05-20T09:30:00", "2026-05-20T10:30:00"),
    ]);

    expect(items.map((item) => item.deckLayout)).toEqual([
      { groupSize: 2, order: 0 },
      { groupSize: 2, order: 1 },
    ]);
  });

  it("returns render-only deck layout for same-day overlapping events", () => {
    const events = [
      createTimedEvent({
        _id: "early-long",
        startDate: "2024-01-15T18:30:00.000Z",
        endDate: "2024-01-15T20:00:00.000Z",
      }),
      createTimedEvent({
        _id: "later-short",
        startDate: "2024-01-15T19:00:00.000Z",
        endDate: "2024-01-15T19:45:00.000Z",
      }),
    ];

    const laid = createTimedEventLayout(events);

    expect(deckOf(laid, "early-long")).toEqual({ order: 0, groupSize: 2 });
    expect(deckOf(laid, "later-short")).toEqual({ order: 1, groupSize: 2 });
    expect(laid[0].event).toBe(events[0]);
    expect(laid[1].event).toBe(events[1]);
  });

  it("orders same-start events longest-first", () => {
    const events = [
      createTimedEvent({
        _id: "short",
        startDate: "2024-01-15T18:00:00.000Z",
        endDate: "2024-01-15T18:30:00.000Z",
      }),
      createTimedEvent({
        _id: "long",
        startDate: "2024-01-15T18:00:00.000Z",
        endDate: "2024-01-15T20:00:00.000Z",
      }),
    ];

    const laid = createTimedEventLayout(events);

    expect(deckOf(laid, "long")).toEqual({ order: 0, groupSize: 2 });
    expect(deckOf(laid, "short")).toEqual({ order: 1, groupSize: 2 });
  });

  it("treats a transitive overlap chain as one group", () => {
    const events = [
      createTimedEvent({
        _id: "a",
        startDate: "2024-01-15T10:00:00.000Z",
        endDate: "2024-01-15T11:00:00.000Z",
      }),
      createTimedEvent({
        _id: "b",
        startDate: "2024-01-15T10:30:00.000Z",
        endDate: "2024-01-15T11:30:00.000Z",
      }),
      createTimedEvent({
        _id: "c",
        startDate: "2024-01-15T11:00:00.000Z",
        endDate: "2024-01-15T12:00:00.000Z",
      }),
    ];

    const laid = createTimedEventLayout(events);

    expect(deckOf(laid, "a")).toEqual({ order: 0, groupSize: 3 });
    expect(deckOf(laid, "b")).toEqual({ order: 1, groupSize: 3 });
    expect(deckOf(laid, "c")).toEqual({ order: 2, groupSize: 3 });
  });

  it("leaves non-overlapping events without deck layout", () => {
    const events = [
      createTimedEvent({
        _id: "morning",
        startDate: "2024-01-15T09:00:00.000Z",
        endDate: "2024-01-15T10:00:00.000Z",
      }),
      createTimedEvent({
        _id: "afternoon",
        startDate: "2024-01-15T14:00:00.000Z",
        endDate: "2024-01-15T15:00:00.000Z",
      }),
    ];

    const laid = createTimedEventLayout(events);

    expect(deckOf(laid, "morning")).toBeNull();
    expect(deckOf(laid, "afternoon")).toBeNull();
  });

  it("excludes a hidden event from overlap fanning", () => {
    const events = [
      event("visible-a", "2026-05-20T09:00:00", "2026-05-20T10:00:00"),
      event("hidden", "2026-05-20T09:30:00", "2026-05-20T10:30:00"),
      event("visible-b", "2026-05-20T09:45:00", "2026-05-20T10:15:00"),
    ];

    const laid = createTimedEventLayout(events, new Set(["hidden"]));

    expect(deckOf(laid, "visible-a")).toEqual({ order: 0, groupSize: 2 });
    expect(deckOf(laid, "visible-b")).toEqual({ order: 1, groupSize: 2 });
    expect(deckOf(laid, "hidden")).toBeNull();
    expect(laid.find((item) => item.event._id === "hidden")?.isHidden).toBe(
      true,
    );
    expect(laid.filter((item) => item.isHidden)).toHaveLength(1);
  });
});

describe("applyTimedDeckPosition", () => {
  const basePosition = { height: 60, left: 20, top: 30, width: 180 };

  it("shrinks deck width by the reserve and group indents", () => {
    const deck = applyTimedDeckPosition(basePosition, {
      order: 0,
      groupSize: 3,
    });

    expect(deck.width).toBe(
      basePosition.width - DECK_RIGHT_RESERVE - 2 * DECK_INDENT,
    );
  });

  it("indents left by order and sets zIndex", () => {
    const back = applyTimedDeckPosition(basePosition, {
      order: 0,
      groupSize: 3,
    });
    const front = applyTimedDeckPosition(basePosition, {
      order: 2,
      groupSize: 3,
    });

    expect(front.left - back.left).toBe(2 * DECK_INDENT);
    expect(back.zIndex).toBe(1);
    expect(front.zIndex).toBe(3);
    expect(front.width).toBe(back.width);
  });

  it("leaves a wider visible rail for cards behind a same-time overlap", () => {
    const back = applyTimedDeckPosition(basePosition, {
      order: 0,
      groupSize: 2,
    });
    const front = applyTimedDeckPosition(basePosition, {
      order: 1,
      groupSize: 2,
    });

    expect(front.left - back.left).toBe(DECK_INDENT);
  });

  it("floors deck width for dense groups", () => {
    const deck = applyTimedDeckPosition(
      { ...basePosition, width: 150 - TIMED_EVENT_COLUMN_INSET * 2 },
      { order: 0, groupSize: 8 },
    );

    expect(deck.width).toBe(DECK_MIN_WIDTH);
  });

  it("keeps narrow-column decks inside the usable column", () => {
    const narrowBase = {
      ...basePosition,
      width: EVENT_WIDTH_MINIMUM - TIMED_EVENT_COLUMN_INSET * 2,
    };
    const back = applyTimedDeckPosition(narrowBase, {
      order: 0,
      groupSize: 2,
    });
    const front = applyTimedDeckPosition(narrowBase, {
      order: 1,
      groupSize: 2,
    });

    expect(back.width).toBe(narrowBase.width - DECK_INDENT);
    expect(front.width).toBe(back.width);
    expect(front.left + front.width).toBe(narrowBase.left + narrowBase.width);
  });

  it("keeps dense narrow-column decks inside the usable column", () => {
    const narrowBase = {
      ...basePosition,
      width: EVENT_WIDTH_MINIMUM - TIMED_EVENT_COLUMN_INSET * 2,
    };
    const front = applyTimedDeckPosition(narrowBase, {
      order: 7,
      groupSize: 8,
    });

    expect(front.width).toBeGreaterThan(0);
    expect(front.left + front.width).toBe(narrowBase.left + narrowBase.width);
  });
});

describe("applyTimedEventDisplayPosition", () => {
  const widePosition = { height: 60, left: 20, top: 30, width: 1000 };

  it("sizes solo timed event cards proportionally to the column", () => {
    const position = applyTimedEventDisplayPosition(widePosition, null);

    expect(position.width).toBe(widePosition.width * TIMED_EVENT_WIDTH_RATIO);
  });

  it("keeps scaling solo cards on very wide columns without an upper cap", () => {
    const extraWide = { ...widePosition, width: 2400 };

    const position = applyTimedEventDisplayPosition(extraWide, null);

    expect(position.width).toBe(extraWide.width * TIMED_EVENT_WIDTH_RATIO);
  });

  it("fans overlapping cards farther without widening the cards", () => {
    const cardWidth = widePosition.width * TIMED_EVENT_WIDTH_RATIO;
    const back = applyTimedEventDisplayPosition(widePosition, {
      order: 0,
      groupSize: 2,
    });
    const front = applyTimedEventDisplayPosition(widePosition, {
      order: 1,
      groupSize: 2,
    });

    expect(front.left - back.left).toBe(TIMED_EVENT_FAN_INDENT);
    expect(back.width).toBe(cardWidth - DECK_RIGHT_RESERVE - DECK_INDENT);
    expect(front.width).toBe(back.width);
  });

  it("keeps dense fans inside the right-side gutter", () => {
    const front = applyTimedEventDisplayPosition(widePosition, {
      order: 19,
      groupSize: 20,
    });

    expect(front.left + front.width).toBeLessThanOrEqual(
      widePosition.left + widePosition.width - TIMED_EVENT_FAN_GUTTER,
    );
  });

  it("falls back to the available column width when the column is narrow", () => {
    const narrowPosition = { ...widePosition, width: 90 };
    const front = applyTimedEventDisplayPosition(narrowPosition, {
      order: 1,
      groupSize: 2,
    });

    expect(front.left + front.width).toBe(
      narrowPosition.left + narrowPosition.width,
    );
  });

  it("returns the strip width and original left when hidden", () => {
    const someDeck = { order: 1, groupSize: 2 };
    const position = applyTimedEventDisplayPosition(
      widePosition,
      someDeck,
      true,
    );

    expect(position.width).toBe(HIDDEN_EVENT_STRIP_WIDTH);
    expect(position.left).toBe(widePosition.left);
  });
});
