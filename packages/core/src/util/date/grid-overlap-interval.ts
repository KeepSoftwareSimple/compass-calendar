import { type Dayjs } from "@core/util/date/dayjs";

/** Minimum timed card height on the week/day grid (matches web + mac layout). */
export const GRID_TIMED_EVENT_MIN_DURATION_MINUTES = 15;

/**
 * End instant for overlap grouping: the span the card is actually painted at.
 *
 * Cards paint at least the minimum duration, so a 5 minute task still covers
 * 15 minutes of grid. Grouping on the painted span keeps a following short
 * event from being drawn on top of it. The same floor absorbs mixed sync
 * encodings (Z `startDate` + naive `endDate` wall clock before start).
 */
export function gridOverlapIntervalEnd(start: Dayjs, end: Dayjs): Dayjs {
  if (
    end.diff(start, "minute", true) >= GRID_TIMED_EVENT_MIN_DURATION_MINUTES
  ) {
    return end;
  }

  return start.add(GRID_TIMED_EVENT_MIN_DURATION_MINUTES, "minute");
}
