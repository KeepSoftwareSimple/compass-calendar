import { RRule, rrulestr } from "rrule";

type ExpandHooks = {
  /** Localized instant. Return false to stop, same contract as RRule.all. */
  isBeforeEnd: (localizedMs: number, index: number) => boolean;
  /** Floating UTC fields back onto a real instant. Identity for all-day. */
  localize: (floatingMs: number) => number;
  /**
   * Timed events only. rrulestr's UNTIL is a UTC date; the caller re-expresses
   * it in the same floating frame as dtstart.
   */
  floatUntil?: (parsedUntilMs: number) => number;
};

/**
 * Expand RRULE lines into localized epoch milliseconds. This module imports
 * only `rrule` so a dynamic import from the boot graph does not pull shared
 * app modules into new boot chunks. The caller owns timezones, the 730 cap,
 * and the dtstart prepend.
 */
export function expandOccurrences(
  ruleText: string,
  dtstartMs: number,
  hooks: ExpandHooks,
): number[] {
  const dtstart = new Date(dtstartMs);
  const parsed = ruleText.length > 0 ? rrulestr(ruleText, { dtstart }) : null;
  const options = {
    ...(parsed instanceof RRule ? parsed.origOptions : {}),
    dtstart,
  };
  delete options.tzid;

  if (options.until instanceof Date) {
    if (hooks.floatUntil) {
      options.until = new Date(hooks.floatUntil(options.until.getTime()));
    }
    options.count = null;
  }

  return new RRule(options)
    .all((floating, index) =>
      hooks.isBeforeEnd(hooks.localize(floating.getTime()), index),
    )
    .map((floating) => hooks.localize(floating.getTime()));
}
