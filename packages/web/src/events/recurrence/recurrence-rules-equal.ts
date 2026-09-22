import { ObjectId } from "bson";
import { type Weekday } from "rrule";
import dayjs from "@core/util/date/dayjs";
import { CompassEventRRule } from "@core/util/event/compass.event.rrule";
import { type GridEventDraft } from "@web/events/event-draft.types";
import {
  resolveDraftRecurrenceRules,
  scheduleDatesFromDraft,
} from "@web/events/grid-event-draft.adapter";

const weekdayNumber = (day: number | Weekday): number =>
  typeof day === "number" ? day : day.weekday;

export const sortedByweekday = (
  byweekday: Array<number | Weekday> | null | undefined,
): number[] => (byweekday ?? []).map(weekdayNumber).sort((a, b) => a - b);

const normalizedCount = (count: number | null | undefined): number | null =>
  count == null || count === 0 ? null : count;

const untilEqual = (a: Date | null | undefined, b: Date | null | undefined) => {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return dayjs(a).isSame(b);
};

// Pattern-only RRULE equality for open-for-edit / patch: ignore serialization
// drift (INTERVAL=1, WKST defaults, param/BYDAY order) and never treat the
// occurrence's clicked dtstart as a recurrence edit.
// Whitelist matches RecurrenceSection's editable surface (freq/interval/
// weekdays/until/count). Fields the form cannot edit today (bymonthday,
// bysetpos, nth-weekday) are intentionally ignored. Extend this list if
// the UI gains those controls, or edits to them will not flip preserve to series.
export function recurrenceRulesSemanticallyEqual(
  a: readonly string[],
  b: readonly string[],
  dates: { startDate: string; endDate: string },
): boolean {
  if (a.length === 0 && b.length === 0) return true;
  if (a.length === 0 || b.length === 0) return false;

  const shell = {
    _id: new ObjectId(),
    startDate: dates.startDate,
    endDate: dates.endDate,
  };
  const optsA = new CompassEventRRule({
    ...shell,
    recurrence: { rule: [...a] },
  }).options;
  const optsB = new CompassEventRRule({
    ...shell,
    recurrence: { rule: [...b] },
  }).options;

  return (
    optsA.freq === optsB.freq &&
    (optsA.interval ?? 1) === (optsB.interval ?? 1) &&
    byweekdayEqual(optsA.byweekday, optsB.byweekday) &&
    normalizedCount(optsA.count) === normalizedCount(optsB.count) &&
    untilEqual(optsA.until, optsB.until)
  );
}

function byweekdayEqual(
  a: Array<number | Weekday> | null | undefined,
  b: Array<number | Weekday> | null | undefined,
): boolean {
  const left = sortedByweekday(a);
  const right = sortedByweekday(b);
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function patchGridDraftRecurrence(
  draft: GridEventDraft,
  nextRules: readonly string[],
  seriesRules?: readonly string[],
): GridEventDraft {
  const currentRules = resolveDraftRecurrenceRules(draft, seriesRules);
  const ruleUnchanged = recurrenceRulesSemanticallyEqual(
    currentRules,
    nextRules,
    scheduleDatesFromDraft(draft),
  );
  // Only useRecurrence calls this, and only with an explicit user edit (a
  // weekday/frequency/until change, or the Repeat toggle turned off). A
  // draft that hasn't touched recurrence never reaches here, so it keeps
  // "preserve" from editGridEventDraft instead. Empty rules is therefore
  // always an explicit clear, on both create and edit drafts: "single",
  // never "preserve" (which for an edit draft would just resolve back to
  // the source event's original rules, making the Repeat toggle a no-op).
  if (ruleUnchanged) return draft;

  const recurrence =
    nextRules.length > 0
      ? { kind: "series" as const, rules: [...nextRules] }
      : ({ kind: "single" } as const);

  // The two branches look identical, but each is required to keep
  // GridEventDraft's discriminated union narrowed.
  if (draft.kind === "create") {
    return {
      ...draft,
      values: {
        ...draft.values,
        recurrence,
      },
    };
  }

  return { ...draft, values: { ...draft.values, recurrence } };
}
