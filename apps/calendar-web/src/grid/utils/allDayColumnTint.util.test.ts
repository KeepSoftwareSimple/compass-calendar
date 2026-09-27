import { type CalendarId } from "@core/types/domain-primitives";
import dayjs from "@core/util/date/dayjs";
import {
  EVENT_COLOR_SLOT_HEX,
  getEventPalette,
} from "@web/common/styles/theme.util";
import { type GridVisibleDate } from "@web/grid/types/grid.types";
import {
  ALL_DAY_COLUMN_TINT_PERCENT,
  type AllDayColumnTintEvent,
  allDayColumnTintBackground,
  allDayColumnTintStyle,
  withAllDayColumnTints,
} from "@web/grid/utils/allDayColumnTint.util";
import { describe, expect, it } from "bun:test";

const calendarId = (value: string) => value as CalendarId;

const monday = dayjs("2026-08-10");
const tuesday = dayjs("2026-08-11");
const wednesday = dayjs("2026-08-12");

const weekColumns = (): GridVisibleDate[] => [
  { date: monday, key: "2026-08-10" },
  { date: tuesday, key: "2026-08-11" },
  { date: wednesday, key: "2026-08-12" },
];

const event = (
  overrides: Partial<AllDayColumnTintEvent> &
    Pick<AllDayColumnTintEvent, "startDate" | "endDate">,
): AllDayColumnTintEvent => ({
  row: 1,
  ...overrides,
});

describe("allDayColumnTintBackground", () => {
  it("applies the fixed wash percent via color-mix", () => {
    expect(allDayColumnTintBackground("#0B8043")).toBe(
      `color-mix(in srgb, #0B8043 ${ALL_DAY_COLUMN_TINT_PERCENT}%, transparent)`,
    );
  });
});

describe("allDayColumnTintStyle", () => {
  it("returns the CSS variable and wash when a tint is active", () => {
    expect(allDayColumnTintStyle("#0B8043", false)).toEqual({
      "--column-all-day-tint": "#0B8043",
      backgroundColor: allDayColumnTintBackground("#0B8043"),
    });
  });

  it("returns undefined when jump-day wins or no tint is set", () => {
    expect(allDayColumnTintStyle("#0B8043", true)).toBeUndefined();
    expect(allDayColumnTintStyle(undefined, false)).toBeUndefined();
  });
});

describe("withAllDayColumnTints (date / week)", () => {
  it("returns the same columns when there are no all-day events", () => {
    const columns = weekColumns();
    expect(withAllDayColumnTints(columns, [], "date")).toBe(columns);
  });

  it("tints a single day from the event fill color", () => {
    const tinted = withAllDayColumnTints(
      weekColumns(),
      [
        event({
          startDate: "2026-08-10",
          endDate: "2026-08-11",
          color: "green",
        }),
      ],
      "date",
    );

    expect(tinted[0]?.allDayTintColor).toBe(EVENT_COLOR_SLOT_HEX.green);
    expect(tinted[1]?.allDayTintColor).toBeUndefined();
    expect(tinted[2]?.allDayTintColor).toBeUndefined();
  });

  it("tints every day a multi-day all-day event spans", () => {
    const tinted = withAllDayColumnTints(
      weekColumns(),
      [
        event({
          startDate: "2026-08-10",
          endDate: "2026-08-12",
          color: "mint",
        }),
      ],
      "date",
    );

    expect(tinted[0]?.allDayTintColor).toBe(EVENT_COLOR_SLOT_HEX.mint);
    expect(tinted[1]?.allDayTintColor).toBe(EVENT_COLOR_SLOT_HEX.mint);
    expect(tinted[2]?.allDayTintColor).toBeUndefined();
  });

  it("prefers the topmost chip (lowest row) when multiple cover a day", () => {
    const tinted = withAllDayColumnTints(
      weekColumns(),
      [
        event({
          startDate: "2026-08-10",
          endDate: "2026-08-11",
          color: "blue",
          row: 2,
        }),
        event({
          startDate: "2026-08-10",
          endDate: "2026-08-11",
          color: "green",
          row: 1,
        }),
      ],
      "date",
    );

    expect(tinted[0]?.allDayTintColor).toBe(EVENT_COLOR_SLOT_HEX.green);
  });

  it("keeps the first encounter when rows tie", () => {
    const tinted = withAllDayColumnTints(
      weekColumns(),
      [
        event({
          startDate: "2026-08-10",
          endDate: "2026-08-11",
          color: "coral",
          row: 1,
        }),
        event({
          startDate: "2026-08-10",
          endDate: "2026-08-11",
          color: "gold",
          row: 1,
        }),
      ],
      "date",
    );

    expect(tinted[0]?.allDayTintColor).toBe(EVENT_COLOR_SLOT_HEX.coral);
  });

  it("prefers colorHex over a slot color", () => {
    const tinted = withAllDayColumnTints(
      weekColumns(),
      [
        event({
          startDate: "2026-08-10",
          endDate: "2026-08-11",
          color: "red",
          colorHex: "#009688",
        }),
      ],
      "date",
    );

    expect(tinted[0]?.allDayTintColor).toBe("#009688");
  });

  it("falls back to the theme default fill when no color is set", () => {
    const tinted = withAllDayColumnTints(
      weekColumns(),
      [event({ startDate: "2026-08-10", endDate: "2026-08-11" })],
      "date",
    );

    expect(tinted[0]?.allDayTintColor).toBe(getEventPalette().base);
  });
});

describe("withAllDayColumnTints (calendar / day)", () => {
  const calendarColumns = (): GridVisibleDate[] => [
    { date: monday, key: "cal-a", surfaceLabel: "A" },
    { date: monday, key: "cal-b", surfaceLabel: "B" },
  ];

  it("tints only the calendar column that owns the all-day event", () => {
    const tinted = withAllDayColumnTints(
      calendarColumns(),
      [
        event({
          startDate: "2026-08-10",
          endDate: "2026-08-11",
          calendarId: calendarId("cal-b"),
          color: "plum",
        }),
      ],
      "calendar",
    );

    expect(tinted[0]?.allDayTintColor).toBeUndefined();
    expect(tinted[1]?.allDayTintColor).toBe(EVENT_COLOR_SLOT_HEX.plum);
  });

  it("places events without a calendarId on the first column", () => {
    const tinted = withAllDayColumnTints(
      calendarColumns(),
      [
        event({
          startDate: "2026-08-10",
          endDate: "2026-08-11",
          color: "indigo",
        }),
      ],
      "calendar",
    );

    expect(tinted[0]?.allDayTintColor).toBe(EVENT_COLOR_SLOT_HEX.indigo);
    expect(tinted[1]?.allDayTintColor).toBeUndefined();
  });

  it("falls unknown calendarIds back to the first column", () => {
    const tinted = withAllDayColumnTints(
      calendarColumns(),
      [
        event({
          startDate: "2026-08-10",
          endDate: "2026-08-11",
          calendarId: calendarId("cal-missing"),
          color: "red",
        }),
      ],
      "calendar",
    );

    expect(tinted[0]?.allDayTintColor).toBe(EVENT_COLOR_SLOT_HEX.red);
    expect(tinted[1]?.allDayTintColor).toBeUndefined();
  });

  it("picks the topmost chip within a calendar column", () => {
    const tinted = withAllDayColumnTints(
      calendarColumns(),
      [
        event({
          startDate: "2026-08-10",
          endDate: "2026-08-11",
          calendarId: calendarId("cal-a"),
          color: "orange",
          row: 2,
        }),
        event({
          startDate: "2026-08-10",
          endDate: "2026-08-11",
          calendarId: calendarId("cal-a"),
          color: "slate",
          row: 1,
        }),
      ],
      "calendar",
    );

    expect(tinted[0]?.allDayTintColor).toBe(EVENT_COLOR_SLOT_HEX.slate);
  });
});
