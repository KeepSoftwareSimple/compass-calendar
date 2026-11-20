import dayjs from "@core/util/date/dayjs";
import { type GridEvent } from "@web/common/types/web.event.types";
import { type EventWithDates } from "@web/common/utils/event/event.util";
import { isEventIdHidden } from "@web/events/hidden/hidden-event-id";
import { findRowForEvent } from "./grid.util";

/**
 * Packs all-day events into lanes. Hidden events render as slim strips on
 * their start day, so every hidden event starting the same day shares one
 * lane side by side (`hiddenStripIndex`) instead of taking a lane each.
 */
export const assignEventsToRow = (
  allDayEvents: EventWithDates[],
  hiddenEventIds: ReadonlySet<string> = new Set(),
): {
  rowsCount: number;
  allDayEvents: GridEvent[];
} => {
  const rows: number[][] = [];
  // makes copy of all event objects to allow for adding a 'row' field
  // can likely be optimized using immer's `produce` and `draft`
  const orderedAllDayEvents = allDayEvents?.map((e) => ({
    ...e,
  })) as GridEvent[];

  const hiddenByStartDay = new Map<number, GridEvent[]>();

  orderedAllDayEvents?.forEach((event) => {
    if (isEventIdHidden(event._id, hiddenEventIds)) {
      const startDay = _getEventDayNumbers(event)[0] ?? 0;
      hiddenByStartDay.set(startDay, [
        ...(hiddenByStartDay.get(startDay) ?? []),
        event,
      ]);
      return;
    }
    const eventDays = _getEventDayNumbers(event);
    const rowNum = findRowForEvent(eventDays, rows);

    if (rowNum !== null) {
      // add to existing row
      rows[rowNum] = [...rows[rowNum], ...eventDays];
      event["row"] = rowNum + 1;
      return;
    }

    // add to new row. The first event lands here too: no rows exist yet, so
    // nothing can fit it.
    rows.push(eventDays);
    event["row"] = rows.length;
  });

  hiddenByStartDay.forEach((strips, startDay) => {
    let rowNum = findRowForEvent([startDay], rows);
    if (rowNum === null) {
      rows.push([]);
      rowNum = rows.length - 1;
    }
    rows[rowNum] = [...rows[rowNum], startDay];
    strips.forEach((event, index) => {
      event["row"] = (rowNum as number) + 1;
      event["hiddenStripIndex"] = index;
    });
  });

  return { rowsCount: rows.length, allDayEvents: orderedAllDayEvents };
};

const _getEventDayNumbers = (event: EventWithDates) => {
  const startDayOfYear = dayjs(event.startDate).dayOfYear();
  const endDayOfYear = dayjs(event.endDate).dayOfYear();
  const eventDays = _range(startDayOfYear, endDayOfYear);

  /*
    removes the last number so that it doesn't overlap with neighboring events
    example:
      - an event on July 4 is represented as yyyy-07-04 - yyyy-07-05
        - its original day numbers are: [85, 86]
      - this will cause it to erroneously overlap with an event on July 5
        - because July 5 day numbers will be [86, 87]
        - 86 is shared between both days
      - removing the second number fixes this, because:
        - July 4 is represented as [85]
        - July 5 is [86]
        - There is no overlap, so they can fit on the same row
  */
  if (eventDays.length > 1) {
    eventDays.pop();
  }
  return eventDays;
};

const _range = (start: number, end: number) => {
  // An end before the start means the span crosses New Year, so count on
  // past the end of the year instead: eg. an end of 2 becomes 367/8.
  const last = end < start ? start + end : end;

  return Array(last - start + 1)
    .fill(null)
    .map((_, idx) => start + idx);
};
