import { Origin } from "@core/constants/core.constants";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import { type GridEvent } from "@web/common/types/web.event.types";
import { gridEventDefaultPosition } from "@web/common/utils/event/event.util";
import {
  DECK_CASCADE_INDENT_RATIO,
  HIDDEN_EVENT_STRIP_WIDTH,
  TIMED_EVENT_WIDTH_RATIO,
} from "@web/grid/grid.constants";
import {
  resetEffectiveTimeZoneStoreForTests,
  setBrowserTimeZoneForTests,
  setCalendarTimeZoneHint,
  setPinnedTimeZone,
} from "@web/timezone/effective-timezone.store";
import {
  applyTimedEventDisplayPosition,
  createTimedEventLayout,
  elevateTimedDeckZIndex,
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

const denver = "America/Denver";

const event = (id: string, startDate: string, endDate: string) =>
  createTimedEvent({
    _id: id,
    endDate,
    startDate,
  });

const deckOf = (items: ReturnType<typeof createTimedEventLayout>, id: string) =>
  items.find((item) => item.event._id === id)?.deckLayout ?? null;

describe("createTimedEventLayout", () => {
  it("cascades a later start over an earlier card, indented", () => {
    const items = createTimedEventLayout([
      event("first", "2026-05-20T09:00:00", "2026-05-20T10:00:00"),
      event("second", "2026-05-20T09:30:00", "2026-05-20T10:30:00"),
    ]);

    expect(items.map((item) => item.deckLayout)).toEqual([
      { groupSize: 2, left: 0, width: 1, zIndex: 1 },
      {
        groupSize: 2,
        left: DECK_CASCADE_INDENT_RATIO,
        width: 1 - DECK_CASCADE_INDENT_RATIO,
        zIndex: 2,
      },
    ]);
  });

  it("returns render-only deck layout and keeps event identity", () => {
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

    expect(deckOf(laid, "early-long")?.zIndex).toBe(1);
    expect(deckOf(laid, "later-short")?.zIndex).toBe(2);
    expect(laid[0].event).toBe(events[0]);
    expect(laid[1].event).toBe(events[1]);
  });

  it("places same-start events side by side, longest first", () => {
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

    expect(deckOf(laid, "long")).toEqual({
      groupSize: 2,
      left: 0,
      width: 0.5,
      zIndex: 1,
    });
    expect(deckOf(laid, "short")).toEqual({
      groupSize: 2,
      left: 0.5,
      width: 0.5,
      zIndex: 2,
    });
  });

  it("places near starts side by side without narrowing a far-start chain", () => {
    const events = [
      event("a", "2024-01-15T10:00:00.000Z", "2024-01-15T11:00:00.000Z"),
      event("b", "2024-01-15T10:20:00.000Z", "2024-01-15T11:00:00.000Z"),
      event("c", "2024-01-15T11:00:00.000Z", "2024-01-15T12:00:00.000Z"),
      event("d", "2024-01-15T11:40:00.000Z", "2024-01-15T12:30:00.000Z"),
    ];

    const laid = createTimedEventLayout(events);

    expect(deckOf(laid, "a")).toMatchObject({ left: 0, width: 0.5 });
    expect(deckOf(laid, "b")).toMatchObject({ left: 0.5, width: 0.5 });
    expect(deckOf(laid, "c")).toMatchObject({ left: 0, width: 1 });
    expect(deckOf(laid, "d")).toMatchObject({
      left: DECK_CASCADE_INDENT_RATIO,
      width: 1 - DECK_CASCADE_INDENT_RATIO,
    });
    // c starts as a and b end, so it opens a second group with d.
    expect(laid.map((item) => item.deckLayout?.groupSize)).toEqual([
      2, 2, 2, 2,
    ]);
  });

  it("fits a far start beside a near-start partner instead of covering it", () => {
    const events = [
      event("standup", "2024-01-15T09:00:00.000Z", "2024-01-15T10:00:00.000Z"),
      event("retro", "2024-01-15T09:20:00.000Z", "2024-01-15T10:20:00.000Z"),
      event("planning", "2024-01-15T09:40:00.000Z", "2024-01-15T10:40:00.000Z"),
    ];

    const laid = createTimedEventLayout(events);

    expect(deckOf(laid, "planning")).toMatchObject({
      left: DECK_CASCADE_INDENT_RATIO,
      width: 0.5 - DECK_CASCADE_INDENT_RATIO,
      zIndex: 3,
    });
  });

  it("groups a short task with the event painted right after it", () => {
    const laid = createTimedEventLayout([
      event("invoice", "2024-01-15T12:30:00.000Z", "2024-01-15T12:35:00.000Z"),
      event("bank", "2024-01-15T12:35:00.000Z", "2024-01-15T13:00:00.000Z"),
    ]);

    expect(deckOf(laid, "invoice")).toMatchObject({ left: 0, width: 0.5 });
    expect(deckOf(laid, "bank")).toMatchObject({ left: 0.5, width: 0.5 });
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

  it("decks same-start overlaps when one event is UTC Z and the other is wall clock", () => {
    resetEffectiveTimeZoneStoreForTests();
    setBrowserTimeZoneForTests("Etc/UTC");
    setCalendarTimeZoneHint(denver);
    setPinnedTimeZone(denver);

    const events = [
      createTimedEvent({
        _id: "ritual",
        calendarId: CalendarIdSchema.parse("507f1f77bcf86cd799439012"),
        endDate: "2026-10-31T20:30:00",
        startDate: "2026-11-01T01:00:00.000Z",
        title: "Deutsch …",
      }),
      createTimedEvent({
        _id: "unwind",
        calendarId: CalendarIdSchema.parse("507f1f77bcf86cd799439011"),
        endDate: "2026-10-31T20:00:00-06:00",
        recurrence: { eventId: "series-unwind", rule: ["RRULE:FREQ=WEEKLY"] },
        startDate: "2026-10-31T19:00:00-06:00",
        timeZone: denver,
        title: "Unwind",
      }),
      createTimedEvent({
        _id: "update",
        endDate: "2026-10-31T19:00:00-06:00",
        startDate: "2026-10-31T18:00:00-06:00",
        title: "Update",
      }),
    ];

    const laid = createTimedEventLayout(events);

    expect(deckOf(laid, "ritual")).toMatchObject({ left: 0, width: 0.5 });
    expect(deckOf(laid, "unwind")).toMatchObject({ left: 0.5, width: 0.5 });
    expect(deckOf(laid, "update")).toBeNull();
  });

  it("excludes a hidden event from overlap fanning", () => {
    const events = [
      event("visible-a", "2026-05-20T09:00:00", "2026-05-20T10:00:00"),
      event("hidden", "2026-05-20T09:30:00", "2026-05-20T10:30:00"),
      event("visible-b", "2026-05-20T09:45:00", "2026-05-20T10:15:00"),
    ];

    const laid = createTimedEventLayout(events, new Set(["hidden"]));

    expect(deckOf(laid, "visible-a")).toMatchObject({ groupSize: 2, left: 0 });
    expect(deckOf(laid, "visible-b")).toMatchObject({
      groupSize: 2,
      left: DECK_CASCADE_INDENT_RATIO,
    });
    expect(deckOf(laid, "hidden")).toBeNull();
    expect(laid.find((item) => item.event._id === "hidden")?.isHidden).toBe(
      true,
    );
    expect(laid.filter((item) => item.isHidden)).toHaveLength(1);
  });
});

describe("elevateTimedDeckZIndex", () => {
  it("raises a card above every partner in its group", () => {
    const back = { groupSize: 3, left: 0, width: 1, zIndex: 1 };
    expect(elevateTimedDeckZIndex(back, back.zIndex)).toBeGreaterThan(3);
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

  it("maps deck fractions onto the column and sets zIndex", () => {
    const position = applyTimedEventDisplayPosition(widePosition, {
      groupSize: 2,
      left: 0.25,
      width: 0.5,
      zIndex: 2,
    });

    expect(position).toEqual({
      ...widePosition,
      left: widePosition.left + 250,
      width: 500,
      zIndex: 2,
    });
  });

  it("keeps a narrow column deck inside the usable column", () => {
    const narrowPosition = { ...widePosition, width: 90 };
    const front = applyTimedEventDisplayPosition(narrowPosition, {
      groupSize: 2,
      left: 0.5,
      width: 0.5,
      zIndex: 2,
    });

    expect(front.left + front.width).toBe(
      narrowPosition.left + narrowPosition.width,
    );
  });

  it("returns the strip width and original left when hidden", () => {
    const someDeck = { groupSize: 2, left: 0.5, width: 0.5, zIndex: 2 };
    const position = applyTimedEventDisplayPosition(
      widePosition,
      someDeck,
      true,
    );

    expect(position.width).toBe(HIDDEN_EVENT_STRIP_WIDTH);
    expect(position.left).toBe(widePosition.left);
  });
});
