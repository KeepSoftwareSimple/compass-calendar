import { type EventSchedule } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import { toIanaTimeZone } from "@sync/providers/microsoft/microsoft-timezone";

export interface CancelledOccurrenceMasterContext {
  readonly start?: { readonly dateTime?: string; readonly timeZone?: string };
  readonly originalStartTimeZone?: string;
  readonly recurrence?: {
    readonly range?: { readonly recurrenceTimeZone?: string };
  };
}

/** Graph cancelledOccurrences entry: `OID.<id>.<yyyy-mm-dd>` in the series zone. */
const OID_CANCELLED_DATE = /^OID\.[^.]+(?:\.[^.]+)*\.(\d{4}-\d{2}-\d{2})$/i;

function seriesRecurrenceZone(item: CancelledOccurrenceMasterContext): string {
  const raw =
    item.recurrence?.range?.recurrenceTimeZone ??
    item.originalStartTimeZone ??
    item.start?.timeZone ??
    "UTC";
  return toIanaTimeZone(raw);
}

/** Wall-clock time of the series master occurrence in the recurrence zone. */
function masterOccurrenceClock(
  item: CancelledOccurrenceMasterContext,
  schedule: EventSchedule,
): string | null {
  if (schedule.kind !== "timed") return null;
  const zone = seriesRecurrenceZone(item);
  return dayjs(schedule.start).tz(zone).format("HH:mm:ss");
}

function instantForCancelledSeriesDate(
  dateOnly: string,
  clock: string,
  zone: string,
): Date | null {
  const anchored = dayjs.tz(`${dateOnly}T${clock}`, zone);
  if (!anchored.isValid()) return null;
  return anchored.toDate();
}

function formatExdate(instant: Date, zone: string): string {
  if (zone === "UTC") {
    return `EXDATE:${dayjs.utc(instant).format("YYYYMMDD[T]HHmmss[Z]")}`;
  }
  return `EXDATE;TZID=${zone}:${dayjs(instant).tz(zone).format("YYYYMMDD[T]HHmmss")}`;
}

/** Map Graph `cancelledOccurrences` onto RFC5545 EXDATE lines for the master rules. */
export function cancelledOccurrencesToExdateRules(
  cancelledOccurrences: readonly string[] | undefined,
  item: CancelledOccurrenceMasterContext,
  schedule: EventSchedule,
): readonly string[] {
  if (!cancelledOccurrences?.length) return [];
  const zone = seriesRecurrenceZone(item);
  const clock = masterOccurrenceClock(item, schedule);
  if (!clock) return [];

  const rules: string[] = [];
  for (const entry of cancelledOccurrences) {
    const trimmed = entry.trim();
    const oidMatch = OID_CANCELLED_DATE.exec(trimmed);
    if (oidMatch) {
      const instant = instantForCancelledSeriesDate(oidMatch[1]!, clock, zone);
      if (instant) rules.push(formatExdate(instant, zone));
      continue;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      rules.push(formatExdate(parsed, zone));
    }
  }
  return rules;
}
