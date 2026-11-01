import { atCivilTime } from "@core/util/date/civil-day";
import dayjs from "@core/util/date/dayjs";

export const PREVIEW_LOOP_TIMEZONE = "America/Denver" as const;
export const PREVIEW_LOOP_LOCAL_START_HOUR = 8;

/** 8:00 on the 1st of `year`/`month` (1-based) in America/Denver. */
export function previewLoopMonthStartUtc(year: number, month: number): Date {
  const monthKey = `${year}-${String(month).padStart(2, "0")}-01`;
  return atCivilTime(
    monthKey,
    PREVIEW_LOOP_TIMEZONE,
    PREVIEW_LOOP_LOCAL_START_HOUR,
  ).toDate();
}

/**
 * After a generation finishes, the next one starts on the 1st of the following
 * calendar month at 8:00 Denver (based on when the last step was sent).
 */
export function nextPreviewLoopMonthlyStartAfterCompletion(
  completedAt: Date,
): Date {
  const zoned = dayjs(completedAt).tz(PREVIEW_LOOP_TIMEZONE);
  const nextMonth = zoned.add(1, "month").startOf("month");
  return previewLoopMonthStartUtc(nextMonth.year(), nextMonth.month() + 1);
}

/**
 * First preview run at or after `from`: the next calendar 1st at 8:00 Denver
 * strictly after `from`, or the current month's 1st at 8:00 when `from` is
 * still before that instant.
 */
export function nextPreviewLoopMonthlyStart(from: Date): Date {
  const zoned = dayjs(from).tz(PREVIEW_LOOP_TIMEZONE);
  const thisMonth = previewLoopMonthStartUtc(zoned.year(), zoned.month() + 1);
  if (from.getTime() < thisMonth.getTime()) {
    return thisMonth;
  }
  return nextPreviewLoopMonthlyStartAfterCompletion(from);
}
