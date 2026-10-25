import {
  Frequency,
  RRule,
  rrulestr,
  Weekday,
  type Weekday as WeekdayType,
} from "rrule";
import { type ByWeekday } from "rrule/dist/esm/types";
import dayjs from "@core/util/date/dayjs";
import { UnsupportedRecurrenceError } from "@sync/providers/microsoft/microsoft-recurrence.error";
import {
  type GraphDayOfWeek,
  type GraphPatternedRecurrence,
  type GraphRecurrencePattern,
  type GraphRecurrencePatternType,
  type GraphRecurrenceRange,
  type GraphWeekIndex,
  type MicrosoftRecurrenceWriteContext,
} from "@sync/providers/microsoft/microsoft-recurrence.types";
import {
  ianaZoneToWindows,
  windowsZoneToIana,
} from "@sync/providers/microsoft/windows-zones";

const RRULE_PREFIX = /^RRULE:/i;

const GRAPH_DAY_ORDER: readonly GraphDayOfWeek[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const GRAPH_TO_RRULE_DAY: Record<GraphDayOfWeek, string> = {
  sunday: "SU",
  monday: "MO",
  tuesday: "TU",
  wednesday: "WE",
  thursday: "TH",
  friday: "FR",
  saturday: "SA",
};

const RRULE_WEEKDAY_TOKENS = [
  "MO",
  "TU",
  "WE",
  "TH",
  "FR",
  "SA",
  "SU",
] as const;

const RRULE_TO_GRAPH_DAY: Record<string, GraphDayOfWeek> = {
  SU: "sunday",
  MO: "monday",
  TU: "tuesday",
  WE: "wednesday",
  TH: "thursday",
  FR: "friday",
  SA: "saturday",
};

const INDEX_TO_ORDINAL: Record<GraphWeekIndex, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  last: -1,
};

const ORDINAL_TO_INDEX: Record<number, GraphWeekIndex> = {
  1: "first",
  2: "second",
  3: "third",
  4: "fourth",
  [-1]: "last",
};

interface ParsedRRuleParts {
  readonly freq: string;
  readonly interval: number;
  readonly byday: readonly string[];
  readonly wkst?: string;
  readonly bymonthday: readonly number[];
  readonly bymonth: readonly number[];
  readonly count?: number;
  readonly until?: string;
}

export function toRRule(
  recurrence: GraphPatternedRecurrence,
): readonly [string] {
  const normalized = normalizeGraphRecurrence(recurrence);
  const patternParts = patternToParts(normalized.pattern);
  const rangeParts = rangeToParts(normalized.range);
  const rule = serializeRRule({ ...patternParts, ...rangeParts });
  return [rule];
}

function normalizeGraphRecurrence(
  recurrence: GraphPatternedRecurrence,
): GraphPatternedRecurrence {
  return { ...recurrence, pattern: normalizeGraphPattern(recurrence.pattern) };
}

function normalizeGraphPattern(
  pattern: GraphRecurrencePattern,
): GraphRecurrencePattern {
  const interval = pattern.interval ?? 1;
  const daysOfWeek = pattern.daysOfWeek?.map(normalizeGraphDayOfWeek);
  const firstDayOfWeek = pattern.firstDayOfWeek
    ? normalizeGraphDayOfWeek(pattern.firstDayOfWeek)
    : pattern.firstDayOfWeek;

  let type = pattern.type;
  if (
    type === "daily" &&
    daysOfWeek &&
    daysOfWeek.length > 0 &&
    interval === 1
  ) {
    type = "weekly";
  }

  return {
    ...pattern,
    type,
    interval,
    ...(daysOfWeek ? { daysOfWeek } : {}),
    ...(firstDayOfWeek ? { firstDayOfWeek } : {}),
  };
}

function normalizeGraphDayOfWeek(day: string): GraphDayOfWeek {
  const normalized = day.toLowerCase() as GraphDayOfWeek;
  if (!GRAPH_TO_RRULE_DAY[normalized]) {
    throw new UnsupportedRecurrenceError(`Unknown weekday: ${day}`);
  }
  return normalized;
}

export function fromRRule(
  rules: readonly string[],
  context: MicrosoftRecurrenceWriteContext,
): GraphPatternedRecurrence {
  const parsed = parseSupportedRule(rules);
  const pattern = partsToPattern(parsed);
  const range = partsToRange(parsed, context);
  return { pattern, range };
}

function patternToParts(
  pattern: GraphRecurrencePattern,
): Omit<ParsedRRuleParts, "count" | "until"> {
  const interval = pattern.interval ?? 1;
  switch (pattern.type) {
    case "daily":
      return {
        freq: "DAILY",
        interval,
        byday: [],
        bymonthday: [],
        bymonth: [],
      };
    case "weekly":
      return {
        freq: "WEEKLY",
        interval,
        byday: requireDays(
          pattern.daysOfWeek,
          pattern.type,
          pattern.firstDayOfWeek ?? "sunday",
        ).map(graphDayToRrule),
        wkst: graphDayToRrule(pattern.firstDayOfWeek ?? "sunday"),
        bymonthday: [],
        bymonth: [],
      };
    case "absoluteMonthly":
      return {
        freq: "MONTHLY",
        interval,
        byday: [],
        bymonthday: [requireDayOfMonth(pattern.dayOfMonth, pattern.type)],
        bymonth: [],
      };
    case "relativeMonthly":
      return {
        freq: "MONTHLY",
        interval,
        byday: relativeByDay(pattern),
        bymonthday: [],
        bymonth: [],
      };
    case "absoluteYearly":
      return {
        freq: "YEARLY",
        interval,
        byday: [],
        bymonthday: [requireDayOfMonth(pattern.dayOfMonth, pattern.type)],
        bymonth: [requireMonth(pattern.month, pattern.type)],
      };
    case "relativeYearly":
      return {
        freq: "YEARLY",
        interval,
        byday: relativeByDay(pattern),
        bymonthday: [],
        bymonth: [requireMonth(pattern.month, pattern.type)],
      };
    default: {
      const _exhaustive: never = pattern.type;
      throw new UnsupportedRecurrenceError(
        `Unsupported recurrence pattern type: ${String(_exhaustive)}`,
      );
    }
  }
}

function rangeToParts(
  range: GraphRecurrenceRange,
): Pick<ParsedRRuleParts, "count" | "until"> {
  switch (range.type) {
    case "noEnd":
      return {};
    case "numbered":
      return {
        count: requireCount(range.numberOfOccurrences, range.type),
      };
    case "endDate": {
      const endDate = requireEndDate(range.endDate, range.type);
      const zone = range.recurrenceTimeZone ?? "UTC";
      const iana = resolveIanaZone(zone);
      return {
        until: endDateToUntil(endDate, iana),
      };
    }
    default: {
      const _exhaustive: never = range.type;
      throw new UnsupportedRecurrenceError(
        `Unsupported recurrence range type: ${String(_exhaustive)}`,
      );
    }
  }
}

function partsToPattern(parts: ParsedRRuleParts): GraphRecurrencePattern {
  switch (parts.freq) {
    case "DAILY":
      return { type: "daily", interval: parts.interval };
    case "WEEKLY":
      return {
        type: "weekly",
        interval: parts.interval,
        daysOfWeek: sortGraphDays(
          parts.byday.map(rruleDayToGraph),
          parts.wkst ? rruleDayToGraph(parts.wkst) : "sunday",
        ),
        firstDayOfWeek: rruleDayToGraph(parts.wkst ?? "SU"),
      };
    case "MONTHLY":
      if (parts.bymonthday.length > 0) {
        return {
          type: "absoluteMonthly",
          interval: parts.interval,
          dayOfMonth: parts.bymonthday[0]!,
        };
      }
      return relativePattern("relativeMonthly", parts);
    case "YEARLY":
      if (parts.bymonthday.length > 0) {
        return {
          type: "absoluteYearly",
          interval: parts.interval,
          dayOfMonth: parts.bymonthday[0]!,
          month: parts.bymonth[0]!,
        };
      }
      return relativePattern("relativeYearly", parts);
    default:
      throw new UnsupportedRecurrenceError(
        `Unsupported RRULE frequency: ${parts.freq}`,
      );
  }
}

function relativePattern(
  type: Extract<
    GraphRecurrencePatternType,
    "relativeMonthly" | "relativeYearly"
  >,
  parts: ParsedRRuleParts,
): GraphRecurrencePattern {
  const { ordinal, days } = splitRelativeByDay(parts.byday);
  const pattern: GraphRecurrencePattern = {
    type,
    interval: parts.interval,
    daysOfWeek: days,
    index: ordinal,
  };
  if (type === "relativeYearly") {
    return { ...pattern, month: parts.bymonth[0]! };
  }
  return pattern;
}

function partsToRange(
  parts: ParsedRRuleParts,
  context: MicrosoftRecurrenceWriteContext,
): GraphRecurrenceRange {
  const base: GraphRecurrenceRange = {
    type: "noEnd",
    startDate: context.startDate,
  };

  if (parts.count !== undefined) {
    return {
      ...base,
      type: "numbered",
      numberOfOccurrences: parts.count,
      ...(context.ianaTimeZone
        ? { recurrenceTimeZone: ianaZoneToWindows(context.ianaTimeZone) }
        : {}),
    };
  }

  if (parts.until) {
    const iana = context.ianaTimeZone ?? "UTC";
    return {
      ...base,
      type: "endDate",
      endDate: untilToEndDate(parts.until, iana),
      recurrenceTimeZone: ianaZoneToWindows(iana),
    };
  }

  return base;
}

function parseSupportedRule(rules: readonly string[]): ParsedRRuleParts {
  const line = rules.find((rule) => RRULE_PREFIX.test(rule.trim()));
  if (!line) {
    throw new UnsupportedRecurrenceError("Recurrence rules must include RRULE");
  }

  const parsed = rrulestr(line.trim(), { forceset: false });
  if (!(parsed instanceof RRule)) {
    throw new UnsupportedRecurrenceError(
      "Microsoft Graph supports a single RRULE per event",
    );
  }

  assertSupportedOptions(parsed);

  const options = parsed.origOptions;
  const byweekday = normalizeWeekdays(options.byweekday);
  const bymonthday = normalizeNumbers(options.bymonthday);
  const bymonth = normalizeNumbers(options.bymonth);
  const byhour = normalizeNumbers(options.byhour);
  const bysetpos = normalizeNumbers(options.bysetpos);

  if (byhour.length > 0) {
    throw new UnsupportedRecurrenceError(
      "BYHOUR is not supported by Microsoft Graph",
    );
  }
  if (bysetpos.length > 0) {
    throw new UnsupportedRecurrenceError(
      "BYSETPOS is not supported by Microsoft Graph",
    );
  }
  if (bymonth.length > 1) {
    throw new UnsupportedRecurrenceError(
      "Multiple BYMONTH values are not supported by Microsoft Graph",
    );
  }

  const freq = frequencyName(options.freq);
  const interval = options.interval ?? 1;
  const byday = byweekdayToTokens(byweekday, freq);
  const wkst =
    options.wkst === undefined
      ? undefined
      : weekdayToken(options.wkst as WeekdayType | number);

  return {
    freq,
    interval,
    byday,
    wkst,
    bymonthday,
    bymonth,
    ...(options.count !== undefined && options.count !== null
      ? { count: options.count }
      : {}),
    ...(options.until instanceof Date
      ? { until: formatUntil(options.until) }
      : {}),
  };
}

function assertSupportedOptions(rule: RRule): void {
  const freq = rule.origOptions.freq;
  if (
    freq === Frequency.HOURLY ||
    freq === Frequency.MINUTELY ||
    freq === Frequency.SECONDLY
  ) {
    throw new UnsupportedRecurrenceError(
      "Hourly, minutely, and secondly recurrence is not supported by Microsoft Graph",
    );
  }
}

function serializeRRule(parts: ParsedRRuleParts): string {
  const segments = [`FREQ=${parts.freq}`];
  if (parts.interval !== 1) {
    segments.push(`INTERVAL=${parts.interval}`);
  }
  if (parts.byday.length > 0) {
    segments.push(`BYDAY=${parts.byday.join(",")}`);
  }
  if (parts.bymonthday.length > 0) {
    segments.push(`BYMONTHDAY=${parts.bymonthday.join(",")}`);
  }
  if (parts.bymonth.length > 0) {
    segments.push(`BYMONTH=${parts.bymonth.join(",")}`);
  }
  if (parts.wkst) {
    segments.push(`WKST=${parts.wkst}`);
  }
  if (parts.count !== undefined) {
    segments.push(`COUNT=${parts.count}`);
  }
  if (parts.until) {
    segments.push(`UNTIL=${parts.until}`);
  }
  return `RRULE:${segments.join(";")}`;
}

function relativeByDay(pattern: GraphRecurrencePattern): string[] {
  const ordinal = INDEX_TO_ORDINAL[pattern.index ?? "first"];
  return requireDays(pattern.daysOfWeek, pattern.type).map((day) =>
    ordinalDayToken(ordinal, graphDayToRrule(day)),
  );
}

/** `1MO` is just `MO` in RRULE; every other ordinal, last included, prefixes. */
function ordinalDayToken(ordinal: number, code: string): string {
  return ordinal === 1 ? code : `${ordinal}${code}`;
}

function splitRelativeByDay(byday: readonly string[]): {
  ordinal: GraphWeekIndex;
  days: GraphDayOfWeek[];
} {
  if (byday.length === 0) {
    throw new UnsupportedRecurrenceError("Relative recurrence requires BYDAY");
  }

  const parsed = byday.map(parseOrdinalDay);
  const ordinals = new Set(parsed.map((entry) => entry.ordinal));
  if (ordinals.size > 1) {
    throw new UnsupportedRecurrenceError(
      "Multiple BYDAY ordinals are not supported by Microsoft Graph",
    );
  }

  const ordinal = ORDINAL_TO_INDEX[parsed[0]!.ordinal];
  if (!ordinal) {
    throw new UnsupportedRecurrenceError(
      `Unsupported BYDAY ordinal: ${parsed[0]!.ordinal}`,
    );
  }

  return {
    ordinal,
    days: sortGraphDays(parsed.map((entry) => entry.day)),
  };
}

function parseOrdinalDay(token: string): {
  ordinal: number;
  day: GraphDayOfWeek;
} {
  const match = /^(-?\d+)?([A-Z]{2})$/.exec(token.toUpperCase());
  if (!match) {
    throw new UnsupportedRecurrenceError(`Invalid BYDAY token: ${token}`);
  }
  const rawOrdinal = match[1];
  const day = rruleDayToGraph(match[2]!);
  const ordinal = rawOrdinal ? Number.parseInt(rawOrdinal, 10) : 1;
  return { ordinal, day };
}

function byweekdayToTokens(
  weekdays: readonly WeekdayType[],
  freq: string,
): string[] {
  if (weekdays.length === 0) return [];

  if (freq === "WEEKLY") {
    return weekdays.map((day) => weekdayToken(day));
  }

  const ordinals = new Set(weekdays.map(weekdayOrdinal));
  if (ordinals.size > 1) {
    throw new UnsupportedRecurrenceError(
      "Multiple BYDAY ordinals are not supported by Microsoft Graph",
    );
  }

  return weekdays.map((day) =>
    ordinalDayToken(weekdayOrdinal(day), weekdayToken(day)),
  );
}

function weekdayOrdinal(day: WeekdayType): number {
  return day.n === 0 ? 1 : (day.n ?? 1);
}

function weekdayToken(day: WeekdayType | number): string {
  if (typeof day === "number") {
    const token = RRULE_WEEKDAY_TOKENS[day];
    if (!token) {
      throw new UnsupportedRecurrenceError(`Invalid weekday index: ${day}`);
    }
    return token;
  }
  return RRULE_WEEKDAY_TOKENS[day.weekday]!;
}

function frequencyName(freq: Frequency | undefined): string {
  switch (freq) {
    case Frequency.YEARLY:
      return "YEARLY";
    case Frequency.MONTHLY:
      return "MONTHLY";
    case Frequency.WEEKLY:
      return "WEEKLY";
    case Frequency.DAILY:
      return "DAILY";
    default:
      throw new UnsupportedRecurrenceError(
        `Unsupported RRULE frequency: ${String(freq)}`,
      );
  }
}

function normalizeWeekdays(
  value: ByWeekday | ByWeekday[] | null | undefined,
): WeekdayType[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((entry) => {
    if (typeof entry === "number") return new Weekday(entry);
    if (typeof entry === "string") return Weekday.fromStr(entry);
    return entry;
  });
}

function normalizeNumbers(
  value: number | number[] | null | undefined,
): number[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function graphDayToRrule(day: GraphDayOfWeek): string {
  return GRAPH_TO_RRULE_DAY[day];
}

function rruleDayToGraph(token: string): GraphDayOfWeek {
  const day = RRULE_TO_GRAPH_DAY[token.toUpperCase()];
  if (!day) {
    throw new UnsupportedRecurrenceError(`Unknown weekday token: ${token}`);
  }
  return day;
}

function sortGraphDays(
  days: readonly GraphDayOfWeek[],
  weekStartsOn: GraphDayOfWeek = "sunday",
): GraphDayOfWeek[] {
  const start = GRAPH_DAY_ORDER.indexOf(weekStartsOn);
  const order = [
    ...GRAPH_DAY_ORDER.slice(start),
    ...GRAPH_DAY_ORDER.slice(0, start),
  ];
  return [...days].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

function requireDays(
  days: readonly GraphDayOfWeek[] | undefined,
  type: GraphRecurrencePatternType,
  weekStartsOn: GraphDayOfWeek = "sunday",
): GraphDayOfWeek[] {
  if (!days || days.length === 0) {
    throw new UnsupportedRecurrenceError(
      `${type} recurrence requires daysOfWeek`,
    );
  }
  return sortGraphDays(days, weekStartsOn);
}

function requireDayOfMonth(
  dayOfMonth: number | undefined,
  type: GraphRecurrencePatternType,
): number {
  if (dayOfMonth === undefined) {
    throw new UnsupportedRecurrenceError(
      `${type} recurrence requires dayOfMonth`,
    );
  }
  return dayOfMonth;
}

function requireMonth(
  month: number | undefined,
  type: GraphRecurrencePatternType,
): number {
  if (month === undefined) {
    throw new UnsupportedRecurrenceError(`${type} recurrence requires month`);
  }
  return month;
}

function requireCount(
  count: number | undefined,
  type: GraphRecurrenceRange["type"],
): number {
  if (count === undefined) {
    throw new UnsupportedRecurrenceError(`${type} recurrence requires count`);
  }
  return count;
}

function requireEndDate(
  endDate: string | undefined,
  type: GraphRecurrenceRange["type"],
): string {
  if (!endDate) {
    throw new UnsupportedRecurrenceError(`${type} recurrence requires endDate`);
  }
  return endDate;
}

function resolveIanaZone(zone: string): string {
  if (zone.includes("/")) return zone;
  return windowsZoneToIana(zone);
}

function endDateToUntil(endDate: string, ianaZone: string): string {
  return dayjs
    .tz(endDate, "YYYY-MM-DD", ianaZone)
    .endOf("day")
    .utc()
    .format("YYYYMMDD[T]HHmmss[Z]");
}

function untilToEndDate(until: string, ianaZone: string): string {
  const parsed =
    until.length === 8
      ? dayjs.utc(until, "YYYYMMDD", true)
      : dayjs.utc(until, "YYYYMMDD[T]HHmmss[Z]", true);
  if (!parsed.isValid()) {
    throw new UnsupportedRecurrenceError(`Invalid UNTIL value: ${until}`);
  }
  return parsed.tz(ianaZone).format("YYYY-MM-DD");
}

function formatUntil(until: Date): string {
  return dayjs.utc(until).format("YYYYMMDD[T]HHmmss[Z]");
}
