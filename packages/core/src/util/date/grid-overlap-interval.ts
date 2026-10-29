import { type Dayjs } from "@core/util/date/dayjs";

/** Minimum timed card height on the week/day grid (matches web + mac layout). */
export const GRID_TIMED_EVENT_MIN_DURATION_MINUTES = 15;

/**
 * End instant for overlap grouping when parsed grid bounds invert or collapse.
 *
 * Mixed sync encodings (Z `startDate` + naive `endDate` wall clock before start)
 * still paint using the minimum duration; deck grouping must use the same
 * effective span or overlapping columns stay full width.
 */
export function gridOverlapIntervalEnd(start: Dayjs, end: Dayjs): Dayjs {
  if (end.diff(start, "minute", true) >= 1) {
    return end;
  }

  return start.add(GRID_TIMED_EVENT_MIN_DURATION_MINUTES, "minute");
}
