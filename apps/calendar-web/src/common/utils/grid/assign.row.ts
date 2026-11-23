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
  // Absolute day numbers (not day of year) so spans that cross New Year, or
  // start in an earlier year, still collide with events on the same days.
  const start = _dayNumber(event.startDate);
  const end = _dayNumber(event.endDate);
  const eventDays = Array.from(
    { length: Math.max(end - start, 0) + 1 },
    (_, idx) => start + idx,
  );

  /*
    removes the last number so that it doesn't overlap with neighboring events
    (the end date is exclusive: an event on July 4 is July 4 - July 5)
  */
  if (eventDays.length > 1) {
    eventDays.pop();
  }
  return eventDays;
};

const _dayNumber = (date: string | Date) => {
  const d = dayjs(date);
  return Math.floor(Date.UTC(d.year(), d.month(), d.date()) / 86_400_000);
};
