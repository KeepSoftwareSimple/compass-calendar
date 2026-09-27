import dayjs from "@core/util/date/dayjs";

/**
 * Whole days remaining before `trialEndsAt`, for the sidebar trial badge.
 *
 * Rounded up so the final partial day still reads as "1 day left" rather than
 * "0": the trial is live until Stripe says otherwise, and a badge showing 0
 * while the app still works is a lie. Clamped at 0 for a past date, which the
 * badge treats as its last day.
 */
export function getTrialDaysLeft(
  trialEndsAt: string,
  now: dayjs.Dayjs = dayjs(),
): number {
  const end = dayjs(trialEndsAt);
  if (!end.isValid()) return 0;
  return Math.max(0, Math.ceil(end.diff(now, "day", true)));
}

/** Badge text. Compact, because the month picker header row is narrow. */
export function formatTrialBadgeLabel(daysLeft: number): string {
  return daysLeft <= 0 ? "Last day" : `${daysLeft}d`;
}

/** The full sentence, for screen readers and the tooltip. */
export function formatTrialBadgeDescription(daysLeft: number): string {
  if (daysLeft <= 0) return "Last day of your trial";
  if (daysLeft === 1) return "1 day left in your trial";
  return `${daysLeft} days left in your trial`;
}
