import {
  EVENT_ALLDAY_GAP,
  EVENT_ALLDAY_ROW_HEIGHT,
} from "@web/grid/grid.constants";
import {
  ALL_DAY_ROW_SPARE_LANE_PX,
  allDayHiddenCountsByColumn,
  allDayLaneCountFromEvents,
  allDayRowHeightPx,
  allDayRowStackHeightPx,
  collapsedAllDayRowHeightPx,
  compactAllDayRowHeightPx,
  isAllDayLaneFolded,
  isAllDayRowCollapsible,
} from "@web/grid/utils/allDayRowHeight.util";
import { describe, expect, it } from "bun:test";

describe("allDayRowHeight.util", () => {
  it("sizes the stack from lane count with no empty-lane floor", () => {
    expect(allDayRowStackHeightPx(0)).toBe(2 * EVENT_ALLDAY_GAP);
    expect(allDayRowStackHeightPx(3)).toBe(
      2 * EVENT_ALLDAY_GAP + 3 * EVENT_ALLDAY_ROW_HEIGHT,
    );
  });

  it("keeps an empty row to one slim clickable lane", () => {
    expect(ALL_DAY_ROW_SPARE_LANE_PX).toBe(EVENT_ALLDAY_ROW_HEIGHT);
    expect(compactAllDayRowHeightPx(0)).toBe(
      2 * EVENT_ALLDAY_GAP + EVENT_ALLDAY_ROW_HEIGHT,
    );
    expect(compactAllDayRowHeightPx(0)).toBeLessThanOrEqual(30);
  });

  it("adds exactly one spare lane below stacked chips", () => {
    expect(compactAllDayRowHeightPx(2)).toBe(
      allDayRowStackHeightPx(2) + ALL_DAY_ROW_SPARE_LANE_PX,
    );
  });

  it("collapses only past three lanes, to two chip lanes plus a more lane", () => {
    expect(isAllDayRowCollapsible(3)).toBe(false);
    expect(isAllDayRowCollapsible(4)).toBe(true);
    expect(collapsedAllDayRowHeightPx()).toBe(
      2 * EVENT_ALLDAY_GAP + 3 * EVENT_ALLDAY_ROW_HEIGHT,
    );
    expect(allDayRowHeightPx(3, false)).toBe(compactAllDayRowHeightPx(3));
    expect(allDayRowHeightPx(8, false)).toBe(collapsedAllDayRowHeightPx());
    expect(allDayRowHeightPx(8, true)).toBe(compactAllDayRowHeightPx(8));
  });

  it("derives lane count from assigned row numbers", () => {
    expect(allDayLaneCountFromEvents([])).toBe(0);
    expect(
      allDayLaneCountFromEvents([
        { row: 1 } as never,
        { row: 3 } as never,
        { row: 2 } as never,
      ]),
    ).toBe(3);
  });

  it("counts chips folded below the visible lanes per column", () => {
    const events = [
      { row: 1, col: [0] },
      { row: 3, col: [0, 1] },
      { row: 4, col: [1] },
      { row: 2, col: [2] },
    ];
    expect(
      allDayHiddenCountsByColumn(
        3,
        events as never,
        (event) => (event as unknown as { col: number[] }).col,
      ),
    ).toEqual([1, 2, 0]);
  });

  it("flags an event in a folded lane", () => {
    expect(isAllDayLaneFolded(null)).toBe(false);
    expect(isAllDayLaneFolded({ row: 2 })).toBe(false);
    expect(isAllDayLaneFolded({ row: 3 })).toBe(true);
  });
});
