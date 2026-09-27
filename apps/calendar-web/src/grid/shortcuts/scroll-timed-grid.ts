import { ID_GRID_MAIN } from "@web/common/constants/web.constants";
import { getElemById } from "@web/common/utils/grid/grid.util";
import { TIMED_VISIBLE_HOURS } from "@web/grid/grid.constants";

export type TimedGridScrollDirection = "up" | "down";
export type TimedGridScrollUnit = "page" | "hour";

/**
 * Scrolls the timed grid by one viewport or one hour. Returns whether a
 * grid was found so callers can preventDefault only when the shortcut
 * actually applied.
 */
export const scrollTimedGrid = (
  direction: TimedGridScrollDirection,
  unit: TimedGridScrollUnit,
): boolean => {
  const grid = getElemById(ID_GRID_MAIN);
  if (!grid) return false;

  const delta =
    unit === "page"
      ? grid.clientHeight
      : grid.clientHeight / TIMED_VISIBLE_HOURS;
  if (delta <= 0) return false;

  grid.scrollBy({ top: direction === "down" ? delta : -delta });
  return true;
};
