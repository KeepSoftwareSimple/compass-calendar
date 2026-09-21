import { GCAL_MAX_RECURRENCES } from "@core/constants/core.constants";
import {
  DateOnlySchema,
  DateTimeSchema,
  type EventId,
} from "@core/types/domain-primitives";
import { type Event, type EventSchedule } from "@core/types/event.contracts";
import { type RecurrenceScope } from "@core/types/event-command.contracts";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { getCompassEventDateFormat } from "@core/util/event/event.util";
import {
  composeOccurrenceIdFromSchedule,
  decodeOccurrenceId,
} from "@core/util/occurrence-id";

export type RecurringEditProjection = {
  removeIds: ReadonlySet<string>;
  upserts: readonly Event[];
};

type ProjectRecurringEditInput = {
  scope: RecurrenceScope;
  edited: Event;
  original: Event;
  seriesEvents: readonly Event[];
};

// Instances keep their own `occurrence` recurrence pointer; only content
// propagates from the edit. The series base (and a standalone "single"
// edited into a series) take the edited recurrence itself.
const seriesPatch = (event: Event, edited: Event): Event => ({
  ...event,
  content: edited.content,
  recurrence:
    event.recurrence.kind === "occurrence"
      ? event.recurrence
      : edited.recurrence,
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// When the edit flips timed ↔ allDay, millisecond deltas across kinds produce
// full-day timed ghosts (or invalid allDay strings). Copy the edited schedule
// onto each instance, shifted by that instance's day offset from the original
// occurrence so the edited card keeps `edited.schedule` and siblings keep
// their relative days.
const convertScheduleKind = (
  event: Event,
  original: Event,
  edited: Event,
): EventSchedule => {
  const dayOffset = dayjs(event.schedule.start)
    .startOf("day")
    .diff(dayjs(original.schedule.start).startOf("day"), "day");

  const { schedule } = edited;
  if (schedule.kind === "allDay") {
    return {
      kind: "allDay",
      start: DateOnlySchema.parse(
        dayjs(schedule.start).add(dayOffset, "day").toYearMonthDayString(),
      ),
      end: DateOnlySchema.parse(
        dayjs(schedule.end).add(dayOffset, "day").toYearMonthDayString(),
      ),
    };
  }

  // Shift by calendar day in the event's zone so DST transitions keep the
  // same wall-clock time (plain `.add(n, "day")` on an offset string is a
  // fixed 24h step and drifts across spring-forward / fall-back).
  const shiftTimed = (value: string) => {
    const local = dayjs(value).tz(schedule.timeZone);
    return DateTimeSchema.parse(
      dayjs
        .tz(
          `${local.add(dayOffset, "day").format("YYYY-MM-DD")}T${local.format("HH:mm:ss")}`,
          schedule.timeZone,
        )
        .format(),
    );
  };

  return {
    kind: "timed",
    start: shiftTimed(schedule.start),
    end: shiftTimed(schedule.end),
    timeZone: schedule.timeZone,
  };
};

// Shift a sibling instance by the drag's delta so a series-wide edit
// renders optimistically. Both series-wide scopes use the same delta; they
// differ only in which instances are affected. The edited occurrence is
// applied as-is by the caller — it may already sit at the new time after a
// this-event save — so this helper never shifts that card a second time.
const shiftEvent = (event: Event, original: Event, edited: Event): Event => {
  if (edited.schedule.kind !== original.schedule.kind) {
    return {
      ...event,
      schedule: convertScheduleKind(event, original, edited),
    };
  }

  const startDelta = dayjs(edited.schedule.start).diff(original.schedule.start);
  const endDelta = dayjs(edited.schedule.end).diff(original.schedule.end);

  if (event.schedule.kind === "timed") {
    return {
      ...event,
      schedule: {
        ...event.schedule,
        start: dayjs(event.schedule.start)
          .add(startDelta, "milliseconds")
          .format(),
        end: dayjs(event.schedule.end).add(endDelta, "milliseconds").format(),
      } as Event["schedule"],
    };
  }

  // allDay: DateOnly strings, shifted by whole days.
  return {
    ...event,
    schedule: {
      ...event.schedule,
      start: dayjs(event.schedule.start)
        .add(Math.round(startDelta / MS_PER_DAY), "day")
        .format("YYYY-MM-DD"),
      end: dayjs(event.schedule.end)
        .add(Math.round(endDelta / MS_PER_DAY), "day")
        .format("YYYY-MM-DD"),
    } as Event["schedule"],
  };
};

// Exported for projectSeriesRulesChange's "thisAndFollowing" filtering below.
export const isAtOrAfter = (event: Event, cutoff: Event["schedule"]) => {
  return !dayjs(event.schedule.start).isBefore(cutoff.start);
};

export function projectRecurringEdit({
  scope,
  edited,
  original,
  seriesEvents,
}: ProjectRecurringEditInput): RecurringEditProjection {
  if (scope === "this") {
    return { removeIds: new Set(), upserts: [edited] };
  }

  const affected =
    scope === "all"
      ? seriesEvents
      : seriesEvents.filter(
          (event) =>
            event.id === edited.id || isAtOrAfter(event, original.schedule),
        );

  // Downgrading a series/occurrence to a standalone single event: drop every
  // other affected instance and keep only the edited one.
  if (edited.recurrence.kind === "single") {
    return {
      removeIds: new Set(
        affected.flatMap((event) => (event.id === edited.id ? [] : [event.id])),
      ),
      upserts: [edited],
    };
  }

  const upserts = affected.map((event) => {
    const patched = seriesPatch(event, edited);
    if (event.id === edited.id) {
      return { ...patched, schedule: edited.schedule };
    }
    return shiftEvent(patched, original, edited);
  });

  return { removeIds: new Set(), upserts };
}

type ProjectRecurringDeleteInput = {
  scope: Exclude<RecurrenceScope, "this">;
  target: Event;
  seriesId: string;
  seriesEvents: readonly Event[];
};

// `seriesEvents` (from findSeriesEventsInCache) holds occurrences only, so the
// series base is added back explicitly. It's only removed for "all" — the
// backend keeps the base's earlier instances (and the base itself) intact
// when truncating a "thisAndFollowing" delete.
export function projectRecurringDelete({
  scope,
  target,
  seriesId,
  seriesEvents,
}: ProjectRecurringDeleteInput): RecurringEditProjection {
  const affected =
    scope === "all"
      ? seriesEvents
      : seriesEvents.filter((event) => isAtOrAfter(event, target.schedule));

  const removeIds = new Set<string>(affected.map((event) => event.id));
  removeIds.add(target.id);
  if (scope === "all") removeIds.add(seriesId);

  return { removeIds, upserts: [] };
}

type ProjectSeriesMaterializationInput = {
  /** The series base; `recurrence.kind` must be "series" to expand. */
  base: Event;
  /** Stale cached instances of this series to purge (old rules). */
  cachedSeriesEvents?: readonly Event[];
  /** Ranges worth materializing into (typically the cached query ranges). */
  ranges: readonly { start: string; end: string }[];
  /** Occurrence starts (in the base's schedule format) to skip. */
  exdates?: readonly string[];
};

// rrule expands BYDAY against dtstart's UTC fields. Timed dtstart must be
// floating (UTC fields hold wall-clock time) or every candidate shifts by the
// zone offset. Mirrors CompassEventRRule without importing it: that class
// value-imports rrule, bson, and lodash, which would put them back on boot.
function toFloatingMs(wall: Dayjs): number {
  return Date.UTC(
    wall.year(),
    wall.month(),
    wall.date(),
    wall.hour(),
    wall.minute(),
    wall.second(),
    wall.millisecond(),
  );
}

function localizeFloatingMs(floatingMs: number, timezone: string): number {
  const wall = dayjs.utc(floatingMs).format("YYYY-MM-DDTHH:mm:ss.SSS");
  return dayjs.tz(wall, timezone).valueOf();
}

/**
 * Expand a series base's RRULE into concrete occurrence events so a
 * create/edit that (re)defines recurrence renders instantly instead of after
 * the server round trip. Mirrors the server's materialization: the first
 * occurrence is a real instance and the base stays metadata-only (the grid
 * filters `kind === "series"`). Expansion is bounded by the latest range end
 * and the server's 730-instance cap; per-entry range membership is enforced
 * downstream by `applyEventProjectionAcrossQueries`.
 *
 * Async because the rrule bridge is a dynamic import. Callers that are not a
 * series return before that import, so a non-series edit stays synchronous
 * when the caller does not await a pending promise.
 */
export async function projectSeriesMaterialization({
  base,
  cachedSeriesEvents = [],
  ranges,
  exdates = [],
}: ProjectSeriesMaterializationInput): Promise<RecurringEditProjection> {
  const removeIds = new Set<string>(
    cachedSeriesEvents.flatMap((event) =>
      event.id === base.id ? [] : [event.id],
    ),
  );

  if (base.recurrence.kind !== "series" || ranges.length === 0) {
    return { removeIds, upserts: [base] };
  }

  try {
    const format = getCompassEventDateFormat(base.schedule.start);
    const isTimed = format !== dayjs.DateFormat.YEAR_MONTH_DAY_FORMAT;
    const timezone = dayjs.tz.guess();
    const startWall = dayjs(base.schedule.start, format).tz(timezone);
    const dtstartMs = isTimed
      ? toFloatingMs(startWall)
      : startWall.local().valueOf();
    const durationMs = dayjs(base.schedule.end).diff(
      base.schedule.start,
      "milliseconds",
    );
    const maxEnd = ranges
      .map((range) => dayjs(range.end))
      .reduce((latest, end) => (end.isAfter(latest) ? end : latest));
    const excluded = new Set(exdates);
    const ruleText = base.recurrence.rules
      .filter((line) => /^RRULE:/i.test(line))
      .join("\n")
      .trim();

    const { expandOccurrences } = await import("./rrule-expand");
    const hits = expandOccurrences(ruleText, dtstartMs, {
      localize: (floatingMs) =>
        isTimed ? localizeFloatingMs(floatingMs, timezone) : floatingMs,
      floatUntil: isTimed
        ? (parsedUntilMs) => toFloatingMs(dayjs(parsedUntilMs).tz(timezone))
        : undefined,
      isBeforeEnd: (localizedMs, index) =>
        index < GCAL_MAX_RECURRENCES && dayjs(localizedMs).isBefore(maxEnd),
    });

    // CompassEventRRule.all prepends the series start when the first expanded
    // instant is not dtstart (or when expansion yields nothing).
    const includesDtStart =
      hits[0] !== undefined && dayjs(hits[0]).tz(timezone).isSame(startWall);
    const dates = includesDtStart ? hits : [startWall.valueOf(), ...hits];

    // The prefix a new instance's id composes against. `base.id` is itself
    // already a composite occurrence id for a "thisAndFollowing" split (the
    // clicked instance's id, reused as the optimistic remainder series' own
    // id). Decoding it first and composing against its plain eventId keeps
    // every optimistic instance id ONE level of "::" deep, never nested.
    // A nested id fails BOTH the client's and the server's decoder, which
    // once meant "delete this one instance" silently widened to the whole
    // series when it happened to hit resolveCommandTarget's plain-id
    // fallback before that fallback was made to fail loud instead.
    const idPrefix = decodeOccurrenceId(base.id)?.eventId ?? base.id;

    const instances = dates.flatMap((date) => {
      const start = dayjs(date).format(format);
      if (excluded.has(start)) return [];
      return [
        {
          ...base,
          id: composeOccurrenceIdFromSchedule(idPrefix, {
            kind: base.schedule.kind === "allDay" ? "allDay" : "timed",
            start,
          }) as EventId,
          schedule: {
            ...base.schedule,
            start,
            end: dayjs(date).add(durationMs, "milliseconds").format(format),
          } as Event["schedule"],
          recurrence: { kind: "occurrence", seriesId: base.id },
        } satisfies Event,
      ];
    });

    return { removeIds, upserts: [base, ...instances] };
  } catch {
    return { removeIds, upserts: [base] };
  }
}

type ProjectSeriesRulesChangeInput = {
  scope: RecurrenceScope;
  /** The edited event; `recurrence.kind` must be "series". */
  edited: Event;
  /** The pre-edit cached event (single, series base, or occurrence). */
  original: Event;
  /** seriesIdOf(original); null for a single event becoming a series. */
  seriesId: EventId | null;
  /** Every cached instance of the series, unfiltered. */
  seriesEvents: readonly Event[];
  ranges: readonly { start: string; end: string }[];
};

/**
 * Dispatches a rules-changing recurrence edit (single→series at scope "this",
 * or a rules change at "all"/"thisAndFollowing") to projectSeriesMaterialization,
 * resolving the same per-scope base-rebasing and affected-instance filtering
 * the backend's analyzeReplace applies — mirrors how projectRecurringEdit and
 * projectRecurringDelete take `scope` and internalize their own affected-
 * instance logic, keeping callers thin dispatchers.
 */
export async function projectSeriesRulesChange({
  scope,
  edited,
  original,
  seriesId,
  seriesEvents,
  ranges,
}: ProjectSeriesRulesChangeInput): Promise<RecurringEditProjection> {
  // "all" rewrites the series base in place (server's replaceSeries keeps the
  // base id); "thisAndFollowing" splits, re-basing at the edited event and
  // keeping earlier instances; single→series keeps the edited event's own id.
  const base =
    scope === "all" && seriesId ? { ...edited, id: seriesId } : edited;
  const cachedSeriesEvents =
    scope === "thisAndFollowing"
      ? seriesEvents.filter((event) => isAtOrAfter(event, original.schedule))
      : seriesEvents;

  return projectSeriesMaterialization({ base, cachedSeriesEvents, ranges });
}
