import dayjs from "@core/util/date/dayjs";
import {
  DAY_JUMP_PREFIX_BY_WEEKDAY,
  type DayJumpWeekday,
  dayNameForPrefix,
} from "@web/shortcuts/shift-hint/assign-shift-hint-keys";
import { viewFromPathname } from "@web/shortcuts/tips/shortcut-telemetry";
import { type IntentMessageContext } from "@web/views/Week/pointer-intent/pointer-intent";

/** Shift + the day-jump prefix that selects `dateKey`'s column (Shift W, Shift S U). */
export function dayJumpKeycapsForDate(dateKey: string): string[] {
  const weekday = dayjs(dateKey).day() as DayJumpWeekday;
  const prefix = DAY_JUMP_PREFIX_BY_WEEKDAY[weekday];
  return ["Shift", ...prefix.toUpperCase().split("")];
}

/**
 * Copy context for an empty all-day click. Only Week view has day columns to
 * pick from the keyboard; Day view already targets its one day.
 */
export function allDayClickIntentContext(
  dateKey: string,
  pathname: string,
): IntentMessageContext {
  if (viewFromPathname(pathname) === "day_view") return {};
  const weekday = dayjs(dateKey).day() as DayJumpWeekday;
  return {
    dayKeycaps: dayJumpKeycapsForDate(dateKey),
    dayLabel: dayNameForPrefix(DAY_JUMP_PREFIX_BY_WEEKDAY[weekday]),
  };
}
