import dayjs from "@core/util/date/dayjs";

/**
 * Lower bound for the "Ends on" picker: the recurrence can't stop before
 * the event's own occurrence, so the floor is the event's *start* date.
 * Anchoring it to the *end* used to disable the event's own date whenever
 * the event ran past local midnight (e.g. 23:00-00:30).
 */
export function recurrenceMinDateFromStart(start: Date | string): string {
  return dayjs(start).toYearMonthDayString();
}
