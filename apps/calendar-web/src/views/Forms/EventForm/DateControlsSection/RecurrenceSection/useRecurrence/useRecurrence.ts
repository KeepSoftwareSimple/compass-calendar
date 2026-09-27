import { ObjectId } from "bson";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Frequency, type Options, RRule, type Weekday } from "rrule";
import dayjs from "@core/util/date/dayjs";
import { CompassEventRRule } from "@core/util/event/compass.event.rrule";
import { type GridEventDraft } from "@web/events/event-draft.types";
import {
  resolveDraftRecurrenceRules,
  scheduleDatesFromDraft,
} from "@web/events/grid-event-draft.adapter";
import {
  patchGridDraftRecurrence,
  recurrenceRulesSemanticallyEqual,
  sortedByweekday,
} from "@web/events/recurrence/recurrence-rules-equal";
import {
  type FrequencyValues,
  WEEKDAY_RRULE_MAP,
  type WEEKDAYS,
} from "@web/views/Forms/EventForm/DateControlsSection/RecurrenceSection/constants/recurrence.constants";

const WEEKDAY_LABELS_MAP: Record<keyof typeof WEEKDAY_RRULE_MAP, string> = {
  sunday: RRule.SU.toString(),
  monday: RRule.MO.toString(),
  tuesday: RRule.TU.toString(),
  wednesday: RRule.WE.toString(),
  thursday: RRule.TH.toString(),
  friday: RRule.FR.toString(),
  saturday: RRule.SA.toString(),
};
const REVERSE_WEEKDAY_LABELS_MAP = Object.fromEntries(
  Object.entries(WEEKDAY_LABELS_MAP).map(([key, value]) => [value, key]),
) as Record<string, keyof typeof WEEKDAY_RRULE_MAP>;

const WEEKDAY_MAP: Record<
  number | string | keyof typeof WEEKDAY_RRULE_MAP,
  Weekday
> = [
  RRule.SU,
  RRule.MO,
  RRule.TU,
  RRule.WE,
  RRule.TH,
  RRule.FR,
  RRule.SA,
].reduce(
  (acc, day) => {
    acc[day.weekday] = day;
    acc[day.toString()] = day;
    acc[REVERSE_WEEKDAY_LABELS_MAP[day.toString()]] = day;
    return acc;
  },
  {} as Record<number | string | keyof typeof WEEKDAY_RRULE_MAP, Weekday>,
);

const weekdayKeyFromByweekday = (
  day: number | Weekday,
): keyof typeof WEEKDAY_RRULE_MAP => {
  const weekday = typeof day === "number" ? day : day.weekday;
  return REVERSE_WEEKDAY_LABELS_MAP[WEEKDAY_MAP[weekday].toString()];
};

const recurrencePatternSeedKey = (
  hasRecurrence: boolean,
  options: {
    freq: Frequency;
    interval: number;
    byweekday: Array<number | Weekday> | null | undefined;
    count: number | null;
  },
  until: Date | null,
) => {
  const byweekday = sortedByweekday(options.byweekday).join(",");
  const untilKey = until ? dayjs(until).valueOf() : "";
  return `${hasRecurrence}:${options.freq}:${options.interval ?? 1}:${byweekday}:${options.count ?? ""}:${untilKey}`;
};

export const useRecurrence = (
  draft: GridEventDraft,
  {
    setDraft,
  }: {
    setDraft: Dispatch<SetStateAction<GridEventDraft | null>>;
  },
  seriesRules?: readonly string[],
) => {
  const currentRules = resolveDraftRecurrenceRules(draft, seriesRules);
  const hasRecurrence = currentRules.length > 0;
  const { startDate, endDate } = scheduleDatesFromDraft(draft);
  const _startDate = dayjs(startDate);

  const parsed = useMemo(() => {
    if (!hasRecurrence) {
      return {
        options: {
          freq: Frequency.DAILY,
          interval: 1,
          byweekday: undefined,
          wkst: WEEKDAY_MAP[0].weekday,
          count: null,
          dtstart: _startDate.toDate(),
        },
        until: null as Date | null,
      };
    }

    const rrule = new CompassEventRRule({
      _id: new ObjectId(),
      startDate,
      endDate,
      recurrence: { rule: currentRules },
    });

    return { options: rrule.options, until: rrule.until };
  }, [_startDate, startDate, endDate, hasRecurrence, currentRules]);
  const { options } = parsed;

  const defaultWeekDay: typeof WEEKDAYS = useMemo(
    () => options?.byweekday?.map((day) => weekdayKeyFromByweekday(day)) ?? [],
    [options?.byweekday],
  );

  const defaultWkst = useMemo<Weekday | null>(
    // wkst === 0 is RRule.MO (rrule numbers weekdays MO=0..SU=6) - a falsy
    // check here would treat a parsed WKST=MO as "no wkst" and null it out.
    () => (options?.wkst != null ? WEEKDAY_MAP[options.wkst] : null),
    [options?.wkst],
  );

  // `parsed.until` is already un-floated (CompassEventRRule#until handles
  // the timed-vs-all-day distinction) - it's a real instant, safe to feed
  // back into a new CompassEventRRule's `options.until` below without
  // drifting it on every render (the bug this guards against: seeding from
  // the still-floating `options.until` would double-float on round-trip and
  // never converge, since the semantic-equality guard in the effect below
  // would never pass).
  const [freq, setFreq] = useState<Frequency>(options.freq);
  const [interval, setInterval] = useState<number>(options.interval);
  const [until, setUntilState] = useState<Date | null>(() => parsed.until);
  const [count, setCount] = useState<number | null>(options.count);
  const [wkst, setWkst] = useState<Weekday | null>(defaultWkst);
  const [weekDays, setWeekDays] = useState<typeof WEEKDAYS>(defaultWeekDay);

  const ruleSeedKey = recurrencePatternSeedKey(
    hasRecurrence,
    options,
    parsed.until,
  );
  const [syncedRuleSeedKey, setSyncedRuleSeedKey] = useState(ruleSeedKey);

  if (ruleSeedKey !== syncedRuleSeedKey) {
    setSyncedRuleSeedKey(ruleSeedKey);
    setFreq(options.freq);
    setInterval(options.interval);
    setUntilState(parsed.until);
    setCount(options.count);
    setWkst(defaultWkst);
    setWeekDays(defaultWeekDay);
  }

  // The "Ends on" picker yields local midnight of the clicked day, but RRULE
  // UNTIL is an instant: a 7:30am occurrence on the chosen day falls *after*
  // midnight and never expands, so the series visibly ends a day early. Pin it
  // to the end of the chosen day so the picked date is inclusive, matching how
  // occurrence-projection.ts already reads a date-only UNTIL (T235959) and how
  // Google presents "ends on".
  const setUntil = useCallback(
    (date: Date | null) =>
      setUntilState(date ? dayjs(date).endOf("day").toDate() : null),
    [],
  );

  const byweekday = useMemo(
    () => weekDays.map((day) => WEEKDAY_RRULE_MAP[day].weekday),
    [weekDays],
  );
  const dtstart = useMemo<Date>(() => _startDate.toDate(), [_startDate]);

  const rruleOptions = useMemo<Partial<Options>>(
    () => ({
      freq,
      dtstart,
      interval,
      wkst: wkst?.weekday ?? undefined,
      byweekday,
      until,
      count,
    }),
    [freq, dtstart, interval, wkst, byweekday, until, count],
  );

  const rrule = useMemo(
    () =>
      new CompassEventRRule(
        {
          _id: new ObjectId(),
          startDate,
          endDate,
          recurrence: { rule: [] },
        },
        rruleOptions,
      ),
    [startDate, endDate, rruleOptions],
  );

  const rule = useMemo(() => JSON.stringify(rrule.toRecurrence()), [rrule]);

  const toggleRecurrence = useCallback(() => {
    setDraft((currentDraft) => {
      if (!currentDraft) return currentDraft;

      const rules = resolveDraftRecurrenceRules(currentDraft, seriesRules);

      if (rules.length > 0) {
        return patchGridDraftRecurrence(currentDraft, [], seriesRules);
      }

      return patchGridDraftRecurrence(
        currentDraft,
        JSON.parse(rule),
        seriesRules,
      );
    });
  }, [setDraft, rule, seriesRules]);

  useEffect(() => {
    if (!hasRecurrence) return;

    const nextRule = JSON.parse(rule) as string[];
    const dates = { startDate, endDate };
    if (recurrenceRulesSemanticallyEqual(currentRules, nextRule, dates)) {
      return;
    }

    setDraft((currentDraft) => {
      if (!currentDraft) return currentDraft;

      const projectedRules = resolveDraftRecurrenceRules(
        currentDraft,
        seriesRules,
      );
      if (recurrenceRulesSemanticallyEqual(projectedRules, nextRule, dates)) {
        return currentDraft;
      }

      return patchGridDraftRecurrence(currentDraft, nextRule, seriesRules);
    });
  }, [
    currentRules,
    endDate,
    hasRecurrence,
    rule,
    seriesRules,
    setDraft,
    startDate,
  ]);

  return {
    hasRecurrence,
    weekDays,
    interval: rrule.options.interval,
    freq: rrule.options.freq as FrequencyValues,
    until: rrule.until,
    setFreq,
    setInterval,
    setUntil,
    setCount,
    setWkst,
    setWeekDays,
    toggleRecurrence,
  };
};
