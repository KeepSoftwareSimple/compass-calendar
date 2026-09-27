import { type EventSchedule } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";

/** Compares when an event happens, ignoring wire-format drift (timeZone strings). */
export function eventSchedulesEqual(
  left: EventSchedule,
  right: EventSchedule,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "allDay") {
    return left.start === right.start && left.end === right.end;
  }
  return (
    dayjs(left.start).valueOf() === dayjs(right.start).valueOf() &&
    dayjs(left.end).valueOf() === dayjs(right.end).valueOf()
  );
}
