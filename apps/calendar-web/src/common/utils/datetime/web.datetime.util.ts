/**
 * Utility functions for working with dates and times that are
 * specific to the web app.
 * Datetime utilities that apply to both backend and web
 * should go in @core/
 */
import { YMDHAM_FORMAT } from "@core/constants/date.constants";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";

interface Params_DateChange {
  start: Date;
  end: Date;
}
interface Params_TimeChange {
  oldStart: string;
  oldEnd: string;
  start: string;
  end: string;
}

export const shouldAdjustComplimentDate = (
  changed: "start" | "end",
  vals: Params_DateChange,
) => {
  const { start, end } = vals;
  const _start = dayjs(start);
  const _end = dayjs(end);

  let shouldAdjust = false;
  let compliment = start;

  if (changed === "start") {
    shouldAdjust = _start.isAfter(_end);
    if (shouldAdjust) {
      compliment = start;
    }
  }

  if (changed === "end") {
    shouldAdjust = _end.isBefore(_start);

    if (shouldAdjust) {
      compliment = end;
    }
  }

  return { shouldAdjust, compliment };
};

export const shouldAdjustComplimentTime = (
  changed: "start" | "end",
  vals: Params_TimeChange,
):
  | { shouldAdjust: false }
  | { shouldAdjust: true; adjustment: number; compliment: Dayjs } => {
  const { oldStart, oldEnd, start, end } = vals;

  const _start = dayjs(`2000-01-01 ${start}`, YMDHAM_FORMAT);
  const _end = dayjs(`2000-01-01 ${end}`, YMDHAM_FORMAT);

  // The picked side crossed (or landed on) its compliment. Kept as explicit
  // isAfter/isBefore (not a negated isBefore) so an unparseable time compares
  // false and never triggers an adjustment.
  const isSame = _start.isSame(_end);
  const shouldAdjust =
    changed === "start"
      ? _start.isAfter(_end) || isSame
      : _end.isBefore(_start) || isSame;
  if (!shouldAdjust) return { shouldAdjust: false };

  const duration = Math.abs(
    dayjs(`2000-01-01 ${oldStart}`, YMDHAM_FORMAT).diff(
      dayjs(`2000-01-01 ${oldEnd}`, YMDHAM_FORMAT),
      "minutes",
    ),
  );
  const step = Math.abs(_start.diff(_end, "minutes"));

  return {
    shouldAdjust: true,
    adjustment: duration + step,
    compliment: changed === "start" ? _end : _start,
  };
};
