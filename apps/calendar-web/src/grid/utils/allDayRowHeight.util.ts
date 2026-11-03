import { type GridEvent } from "@web/common/types/web.event.types";
import {
  EVENT_ALLDAY_GAP,
  EVENT_ALLDAY_ROW_HEIGHT,
} from "@web/grid/grid.constants";

/**
 * Empty click lane under the stacked chips: exactly one chip lane, so an empty
 * row is one slim lane tall and a busy row always keeps a place to click.
 */
export const ALL_DAY_ROW_SPARE_LANE_PX = EVENT_ALLDAY_ROW_HEIGHT;

/** Past this many lanes the row can collapse (Google Calendar style). */
export const ALL_DAY_ROW_COLLAPSE_THRESHOLD_LANES = 3;

/**
 * Chip lanes still painted while collapsed; the next lane holds the per-day
 * "+N more" buttons.
 */
export const ALL_DAY_ROW_COLLAPSED_VISIBLE_LANES =
  ALL_DAY_ROW_COLLAPSE_THRESHOLD_LANES - 1;

/** Pixel height of the stacked chip lanes plus top and bottom gaps. */
export function allDayRowStackHeightPx(lanes: number): number {
  return 2 * EVENT_ALLDAY_GAP + Math.max(0, lanes) * EVENT_ALLDAY_ROW_HEIGHT;
}

/** All-day row height: the stacked lanes plus one spare empty lane. */
export function compactAllDayRowHeightPx(lanes: number): number {
  return allDayRowStackHeightPx(lanes) + ALL_DAY_ROW_SPARE_LANE_PX;
}

/** Collapsed height: the visible lanes plus the "+N more" lane. */
export function collapsedAllDayRowHeightPx(): number {
  return allDayRowStackHeightPx(ALL_DAY_ROW_COLLAPSE_THRESHOLD_LANES);
}

export function isAllDayRowCollapsible(lanes: number): boolean {
  return lanes > ALL_DAY_ROW_COLLAPSE_THRESHOLD_LANES;
}

/** Height for the row, given its lanes and the user's collapse preference. */
export function allDayRowHeightPx(lanes: number, isExpanded: boolean): number {
  if (isAllDayRowCollapsible(lanes) && !isExpanded) {
    return collapsedAllDayRowHeightPx();
  }
  return compactAllDayRowHeightPx(lanes);
}

/** Highest assigned 1-based row, or 0 when nothing is stacked. */
export function allDayLaneCountFromEvents(
  events: readonly GridEvent[],
): number {
  const rows = events
    .map(({ row }) => row)
    .filter((row): row is number => row !== undefined);
  return rows.length === 0 ? 0 : Math.max(...rows);
}

/**
 * Per column, how many chips sit below the collapsed visible lanes. Feeds the
 * "+N more" buttons, so a column counts every chip it would hide.
 */
export function allDayHiddenCountsByColumn(
  columnCount: number,
  events: readonly GridEvent[],
  columnIndexesOf: (event: GridEvent) => readonly number[],
): number[] {
  const counts = Array.from({ length: columnCount }, () => 0);
  for (const event of events) {
    if ((event.row ?? 1) <= ALL_DAY_ROW_COLLAPSED_VISIBLE_LANES) continue;
    for (const index of columnIndexesOf(event)) {
      if (index >= 0 && index < columnCount) counts[index] += 1;
    }
  }
  return counts;
}

/** True when `event` sits in a lane the collapsed row folds away. */
export function isAllDayLaneFolded(
  event: Pick<GridEvent, "row"> | null | undefined,
): boolean {
  if (!event) return false;
  return (event.row ?? 1) > ALL_DAY_ROW_COLLAPSED_VISIBLE_LANES;
}
