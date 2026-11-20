import { type GridEvent } from "@web/common/types/web.event.types";
import { isEventIdHidden } from "@web/events/hidden/hidden-event-id";

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
 * id still keep their stacked row. Hidden events are slim strips, so a
 * column's hidden events share one row below its visible ones, side by side.
 */
export const assignDayAllDayEventRows = (
  events: GridEvent[],
  getColumnIndex: (event: GridEvent) => number,
  hiddenEventIds: ReadonlySet<string> = new Set(),
): { allDayEvents: GridEvent[]; rowsCount: number } => {
  if (events.length === 0) {
    return { allDayEvents: events, rowsCount: 0 };
  }

  const isHidden = (event: GridEvent) =>
    isEventIdHidden(event._id, hiddenEventIds);
  const visibleCountByColumn = new Map<number, number>();
  for (const event of events) {
    if (isHidden(event)) continue;
    const columnIndex = getColumnIndex(event);
    visibleCountByColumn.set(
      columnIndex,
      (visibleCountByColumn.get(columnIndex) ?? 0) + 1,
    );
  }

  const nextRowByColumn = new Map<number, number>();
  const nextStripByColumn = new Map<number, number>();
  let rowsCount = 0;

  const allDayEvents = events.map((event) => {
    const columnIndex = getColumnIndex(event);
    if (isHidden(event)) {
      const row = (visibleCountByColumn.get(columnIndex) ?? 0) + 1;
      const hiddenStripIndex = nextStripByColumn.get(columnIndex) ?? 0;
      nextStripByColumn.set(columnIndex, hiddenStripIndex + 1);
      rowsCount = Math.max(rowsCount, row);
      return { ...event, row, hiddenStripIndex };
    }
    const row = nextRowByColumn.get(columnIndex) ?? 1;
    nextRowByColumn.set(columnIndex, row + 1);
    rowsCount = Math.max(rowsCount, row);

    return { ...event, row };
  });

  return { allDayEvents, rowsCount };
};
