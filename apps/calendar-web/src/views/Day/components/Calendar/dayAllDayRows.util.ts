import { type GridEvent } from "@web/common/types/web.event.types";

export { isAllDayEventOnDay } from "@web/grid/utils/allDayEventOnDay.util";

/**
 * Day view columns are calendars on the same date. Week-style row assignment
 * treats every same-day event as overlapping, so N calendars' all-day events
 * stack into N vertical rows. Assign rows per calendar column instead so
 * events in different columns can share a row and the all-day strip stays short.
 *
 * Within a column every displayed all-day event covers the same day, so they
 * always overlap — stacking in input order is enough (no day-span packing).
 * Rows are keyed by encounter order (not `_id`) so untitled drafts without an
 * id still keep their stacked row.
 */
export const assignDayAllDayEventRows = (
  events: GridEvent[],
  getColumnIndex: (event: GridEvent) => number,
): { allDayEvents: GridEvent[]; rowsCount: number } => {
  if (events.length === 0) {
    return { allDayEvents: events, rowsCount: 1 };
  }

  const nextRowByColumn = new Map<number, number>();
  let rowsCount = 1;

  const allDayEvents = events.map((event) => {
    const columnIndex = getColumnIndex(event);
    const row = nextRowByColumn.get(columnIndex) ?? 1;
    nextRowByColumn.set(columnIndex, row + 1);
    rowsCount = Math.max(rowsCount, row);

    return { ...event, row };
  });

  return { allDayEvents, rowsCount };
};
