import { rrulestr } from "rrule";
import { GCAL_MAX_RECURRENCES } from "@core/constants/core.constants";
import { type DateTime, type EventId } from "@core/types/domain-primitives";
import { type EventSchedule } from "@core/types/event.contracts";
import { type OccurrenceKey } from "@core/types/sync/event.contracts";
import dayjs from "@core/util/date/dayjs";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type OccurrenceInput } from "@sync/storage/repositories/event-occurrence.repository";

// Derives the bounded occurrence projection for one event. Sync stores masters
// and exceptions canonically and materializes occurrences only for the rolling
// horizon, so this never expands a series to completion — it stops at the
// horizon end (and caps at GCAL_MAX_RECURRENCES as a defensive bound against a
// pathological high-frequency rule).
//
// The projection is per-event: a seriesMaster expands its rule but omits any
// instant an exception owns (passed as `excludedInstants`, the exceptions'
// recurrenceIds); each exception or single event projects its own one
// occurrence under its own id. So no event's projection ever writes another
// event's occurrence rows, and a series edit rebuilds only that event's window.

export interface ProjectionHorizon {
  // Half-open [start, end) over an occurrence's normalized start instant.
  start: Date;
  end: Date;
}

export function projectOccurrences(
  event: EventRecord,
  horizon: ProjectionHorizon,
  excludedInstants: readonly DateTime[] = [],
  maxIterations = Number.POSITIVE_INFINITY,
): OccurrenceInput[] {
  if (event.recurrence.kind === "seriesMaster") {
    return projectSeriesMaster(
      event,
      event.recurrence.rules,
      horizon,
      excludedInstants,
      maxIterations,
    );
  }

  // A single or exception event is one occurrence at its own schedule. A
  // cancelled exception still projects a row (cancelled) so the gap it carves
  // in the series is visible and reprojection stays deterministic.
  const startAt = scheduleStartAt(event.schedule);
  if (!withinHorizon(startAt, horizon)) return [];
  const cancelled =
    event.recurrence.kind === "exception" && event.recurrence.cancelled;
  return [toOccurrence(event, event.schedule, startAt, cancelled)];
}

function projectSeriesMaster(
  event: EventRecord,
  rules: readonly string[],
  horizon: ProjectionHorizon,
  excludedInstants: readonly DateTime[],
  maxIterations: number,
): OccurrenceInput[] {
  const excluded = new Set(
    excludedInstants.map((instant) => new Date(instant).getTime()),
  );
  // EXDATEs are exclusions the provider baked into the rules themselves —
  // same mechanism as exception-owned instants, so they share the set.
  for (const exdate of dateListInstants(rules, "EXDATE", event.schedule)) {
    excluded.add(exdate.getTime());
  }
  const occurrences: OccurrenceInput[] = [];
  // DTSTART is always an instance of the series when it falls in the horizon,
  // even if BYDAY/COUNT would skip it on expansion. Matches CompassEventRRule
  // (and Google): a Friday event saved with weekly BYDAY=SU still materializes
  // that Friday so the create week's range read — and the SPA grid — see it.
  const dtstart = scheduleStartAt(event.schedule);
  const dtstartMs = dtstart.getTime();
  if (withinHorizon(dtstart, horizon) && !excluded.has(dtstartMs)) {
    occurrences.push(toOccurrence(event, event.schedule, dtstart, false));
  }

  // RDATEs are extra instants alongside the rule's expansion, windowed to the
  // series' own [DTSTART, UNTIL] so a thisAndFollowing split never projects
  // the same RDATE from both halves (the truncated master drops post-UNTIL
  // RDATEs, the remainder drops pre-DTSTART ones). Merge and dedupe — an
  // RDATE may restate an expanded instant. RDATEs ride above the recurrence
  // cap, which only bounds rule expansion.
  const expanded = expandInstants(
    event.schedule,
    rules,
    horizon,
    maxIterations,
  );
  const untilMs = ruleUntilMs(rules);
  const rdates = dateListInstants(rules, "RDATE", event.schedule).filter(
    (instant) =>
      withinHorizon(instant, horizon) &&
      instant.getTime() >= dtstartMs &&
      (untilMs === null || instant.getTime() <= untilMs),
  );
  const starts = [...new Set([...expanded, ...rdates].map((d) => d.getTime()))]
    .sort((a, b) => a - b)
    .map((ms) => new Date(ms));

  for (const originalStart of starts) {
    if (excluded.has(originalStart.getTime())) continue;
    // Already emitted as the DTSTART instance above.
    if (originalStart.getTime() === dtstartMs) continue;
    const schedule = shiftSchedule(event.schedule, originalStart);
    occurrences.push(toOccurrence(event, schedule, originalStart, false));
  }

  return occurrences;
}

// Expands a series to its occurrence START instants within the horizon.
// Timed rules expand on floating wall time and re-localize, so a series that
// crosses a DST transition keeps its wall-clock time (matching how the app
// already materializes series). Iteration is bounded by the horizon end and
// the recurrence cap.
// Whether a rules-array line is the RRULE (vs EXDATE/RDATE) — the
// load-bearing predicate of this module: only RRULE lines are expanded by
// rrulestr or take bounds.
const isRRuleLine = (line: string): boolean => /^RRULE:/i.test(line);

function expandInstants(
  schedule: EventSchedule,
  rules: readonly string[],
  horizon: ProjectionHorizon,
  maxIterations: number,
): Date[] {
  // Only the RRULE line goes to rrulestr. Feeding it a multi-line string with
  // EXDATE/RDATE lines flips it onto its RRuleSet branch, which silently
  // IGNORES the dtstart option — the inner RRule then anchors at `new Date()`,
  // re-basing the whole series on "now" at every projection. That resurrected
  // dead series into the present and shifted every occurrenceKey per run, so
  // per-instance delete tombstones never matched. EXDATE/RDATE are handled by
  // dateListInstants in projectSeriesMaster. Google emits at most one RRULE;
  // extras are ignored.
  const line = rules.find(isRRuleLine);
  if (!line) return [];
  const rule = rrulestr(floatingRules(line, schedule), {
    dtstart: floatingAnchor(schedule),
  });

  const wallInstants: Date[] = [];
  let iterations = 0;
  rule.all((date) => {
    if (++iterations > maxIterations)
      throw new RangeError(
        "Recurrence expansion needs a smaller preparation batch",
      );
    const instant = localizeInstant(date, schedule);
    if (instant.getTime() >= horizon.end.getTime()) return false;
    if (instant.getTime() >= horizon.start.getTime()) wallInstants.push(date);
    return wallInstants.length < GCAL_MAX_RECURRENCES;
  });

  return wallInstants.map((date) => localizeInstant(date, schedule));
}

// Real start instants named by the rules' EXDATE or RDATE lines. Values are
// wall times in the line's TZID (or the event's zone when absent), date-only
// for VALUE=DATE, or real UTC when suffixed Z — each resolves to the same
// real instant localizeInstant produces for an expanded candidate, so they
// compare exactly.
function dateListInstants(
  rules: readonly string[],
  name: "EXDATE" | "RDATE",
  schedule: EventSchedule,
): Date[] {
  const zone = schedule.kind === "timed" ? schedule.timeZone : "UTC";
  const pattern = new RegExp(`^${name}(;[^:]*)?:(.+)$`, "i");
  const instants: Date[] = [];
  for (const line of rules) {
    const match = pattern.exec(line);
    if (!match) continue;
    const tzid = /TZID=([^;:]+)/i.exec(match[1] ?? "")?.[1];
    for (const raw of match[2]!.split(",")) {
      const value = raw.trim();
      if (/^\d{8}$/.test(value)) {
        instants.push(basicUtcToDate(`${value}T000000`));
      } else if (/^\d{8}T\d{6}Z$/.test(value)) {
        instants.push(basicUtcToDate(value.slice(0, -1)));
      } else if (/^\d{8}T\d{6}$/.test(value)) {
        try {
          instants.push(
            dayjs
              .tz(value, dayjs.DateFormat.RFC5545_ZONELESS, tzid ?? zone)
              .toDate(),
          );
        } catch {
          // A non-IANA TZID would throw; Google never sends one. Skip the
          // value rather than sink the whole projection or import page.
        }
      }
    }
  }
  return instants;
}

// The RRULE's UNTIL as a real instant (a date-only UNTIL is inclusive through
// its end of day), or null when unbounded or COUNT-bounded. Used only to
// window RDATEs; rule expansion re-frames UNTIL via floatingRules instead.
function ruleUntilMs(rules: readonly string[]): number | null {
  const rule = rules.find(isRRuleLine);
  const match = rule ? /UNTIL=(\d{8})(T\d{6})?Z?/i.exec(rule) : null;
  if (!match) return null;
  return basicUtcToDate(`${match[1]}${match[2] ?? "T235959"}`).getTime();
}

// Rewrites a rule's UNTIL into the same floating frame as the dtstart. rrule
// parses UNTIL as an absolute UTC instant (Google always emits ...Z) but
// compares it against the floating candidates we expand from floatingAnchor, so
// a real-UTC UNTIL would mis-bound the series by the zone's offset — projecting
// a phantom trailing occurrence west of UTC, or dropping the true final one east
// of it. Reinterpreting UNTIL's instant as wall time in the event's zone, then
// relabeling it UTC, makes the boundary comparison apples-to-apples. All-day
// series already expand in real UTC, so their UNTIL needs no rewrite.
function floatingRules(rule: string, schedule: EventSchedule): string {
  if (schedule.kind !== "timed") return rule;
  const { timeZone } = schedule;
  return rule.replace(/UNTIL=(\d{8}T\d{6})Z?/g, (_match, basic: string) => {
    const wall = dayjs(basicUtcToDate(basic))
      .tz(timeZone)
      .format("YYYYMMDD[T]HHmmss");
    return `UNTIL=${wall}Z`;
  });
}

// Parses a basic-format UTC datetime ("20260610T055959") to its instant.
function basicUtcToDate(basic: string): Date {
  return new Date(
    Date.UTC(
      Number(basic.slice(0, 4)),
      Number(basic.slice(4, 6)) - 1,
      Number(basic.slice(6, 8)),
      Number(basic.slice(9, 11)),
      Number(basic.slice(11, 13)),
      Number(basic.slice(13, 15)),
    ),
  );
}

// The rule's dtstart: the master's wall-clock start expressed as a naive UTC
// instant, so rrule expands on floating wall time regardless of zone.
function floatingAnchor(schedule: EventSchedule): Date {
  if (schedule.kind === "allDay") {
    return new Date(`${schedule.start}T00:00:00.000Z`);
  }
  const local = dayjs(schedule.start).tz(schedule.timeZone);
  return new Date(
    Date.UTC(
      local.year(),
      local.month(),
      local.date(),
      local.hour(),
      local.minute(),
      local.second(),
    ),
  );
}

// Re-anchors one floating expansion date back onto the real timeline: the
// occurrence's civil wall time in the event's zone (DST-aware). For an all-day
// series the floating date is already the occurrence's midnight-UTC instant.
function localizeInstant(floating: Date, schedule: EventSchedule): Date {
  if (schedule.kind === "allDay") return floating;
  const wall = dayjs(floating).utc().format("YYYY-MM-DDTHH:mm:ss");
  return dayjs.tz(wall, schedule.timeZone).toDate();
}

// Bounds a series' rules to end strictly before an instant, by setting (or
// replacing) UNTIL. The UNTIL is a real-UTC instant, exactly as a provider
// emits it — floatingRules re-frames it on expansion — so a thisAndFollowing
// split truncates the master to just the occurrences before the split point.
export function truncateRulesBefore(
  rules: readonly string[],
  instant: Date,
): string[] {
  // UNTIL is inclusive, so back off one second to end strictly before `instant`
  // (the split occurrence itself is excluded). Sub-second cadence isn't modeled.
  const until = new Date(instant.getTime() - 1000)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  // Drop any existing COUNT/UNTIL first: COUNT and UNTIL are mutually exclusive
  // per RFC 5545, and a stale UNTIL would otherwise survive alongside the new one.
  // Only RRULE lines take the bound — appending UNTIL to an EXDATE/RDATE line
  // would corrupt it. (A pre-split EXDATE surviving on both halves is a no-op:
  // an EXDATE naming a non-instant excludes nothing. Split RDATEs are windowed
  // to [DTSTART, UNTIL] by projectSeriesMaster, so each half projects only its
  // own.)
  return stripRuleBounds(rules).map((rule) =>
    isRRuleLine(rule) ? `${rule};UNTIL=${until}` : rule,
  );
}

// Removes COUNT and UNTIL from each rule, leaving an open-ended pattern. Used to
// derive the remainder series of a thisAndFollowing split (it continues the
// original cadence from the split point, unbounded). Naturally a no-op on
// EXDATE/RDATE lines: none of their `;`-separated parts start with COUNT/UNTIL.
export function stripRuleBounds(rules: readonly string[]): string[] {
  return rules.map((rule) =>
    rule
      .split(";")
      .filter((part) => !/^COUNT=/i.test(part) && !/^UNTIL=/i.test(part))
      .join(";"),
  );
}

// The schedule one occurrence of a series has at a given recurrence instant —
// the master's schedule shifted to that instant, preserving duration and zone.
// Used when materializing an exception event for a scope-"this" edit/delete so
// its instance sits at the right instant.
export function occurrenceScheduleAt(
  masterSchedule: EventSchedule,
  recurrenceId: DateTime,
): EventSchedule {
  return shiftSchedule(masterSchedule, new Date(recurrenceId));
}

// Schedule for a former override after an edit-all. Applies the master's start
// delta so a series time change moves every instance, then materializes at that
// aligned instant with the new master's duration/zone. A content-only edit
// (delta zero) matches occurrenceScheduleAt(next, recurrenceId).
export function occurrenceScheduleAfterSeriesEdit(
  previousMasterSchedule: EventSchedule,
  nextMasterSchedule: EventSchedule,
  recurrenceId: DateTime,
): EventSchedule {
  const deltaMs =
    scheduleStartAt(nextMasterSchedule).getTime() -
    scheduleStartAt(previousMasterSchedule).getTime();
  const alignedStart = new Date(new Date(recurrenceId).getTime() + deltaMs);
  return shiftSchedule(nextMasterSchedule, alignedStart);
}

// Builds one occurrence's schedule from the master's, at the given original
// start instant, preserving duration and (for timed) the zone.
function shiftSchedule(
  master: EventSchedule,
  originalStart: Date,
): EventSchedule {
  if (master.kind === "allDay") {
    const days = dayOnlyDiff(master.start, master.end);
    const start = dayjs(originalStart).utc();
    return {
      kind: "allDay",
      start: start.format("YYYY-MM-DD"),
      end: start.add(days, "day").format("YYYY-MM-DD"),
    } as EventSchedule;
  }
  const durationMs =
    new Date(master.end).getTime() - new Date(master.start).getTime();
  const start = dayjs(originalStart).tz(master.timeZone);
  return {
    kind: "timed",
    start: start.format(),
    end: start.add(durationMs, "millisecond").format(),
    timeZone: master.timeZone,
  } as EventSchedule;
}

function isOccurrenceBusy(event: EventRecord): boolean {
  // Missing provider metadata defaults to busy (Google's opaque default and
  // Compass-created events with no provider bag).
  return event.providerMetadata?.["transparency"] !== "transparent";
}

function toOccurrence(
  event: EventRecord,
  schedule: EventSchedule,
  startAt: Date,
  cancelled: boolean,
): OccurrenceInput {
  return {
    tenantId: event.tenantId,
    principalId: event.principalId,
    eventId: event._id,
    occurrenceKey: occurrenceKey(event._id, startAt),
    calendarId: event.calendarId,
    schedule,
    startAt,
    endAt: scheduleEndAt(schedule),
    busy: isOccurrenceBusy(event),
    title: event.content.title,
    cancelled,
    generation: event.generation,
  };
}

// The normalized start instant used by range queries and the start-time index:
// the timed instant itself, or midnight UTC of an all-day date. Exported so a
// series split can compare its cut point against the master's first occurrence.
export function scheduleStartAt(schedule: EventSchedule): Date {
  if (schedule.kind === "timed") return new Date(schedule.start);
  return new Date(`${schedule.start}T00:00:00.000Z`);
}

// Whether a thisAndFollowing split at `splitAt` lands at or before the
// series' own first occurrence — the threshold at which "delete/edit this
// and following" is equivalent to "delete/edit the whole series" (there is
// nothing left before the split to keep as a separate, un-truncated master).
// Shared by the cloud command path's collapse-to-whole-series branches and
// command-replay's staleness check for the same scope, so the threshold is
// defined once.
export function isFollowingSplitAtSeriesStart(
  schedule: EventSchedule,
  splitAt: Date,
): boolean {
  return splitAt.getTime() <= scheduleStartAt(schedule).getTime();
}

// The normalized EXCLUSIVE end instant, paired with scheduleStartAt to form a
// half-open [startAt, endAt) interval on one coherent UTC axis — what a busy /
// overlap query needs (a timed or all-day occurrence starting before a window
// but ending inside it still overlaps it). The all-day end date is already
// exclusive, so midnight UTC of it is the exclusive end. A zero-duration timed
// schedule (start == end, e.g. a reminder) yields startAt === endAt: it never
// satisfies an overlap query, which is correct — it occupies no busy time —
// but grid reads still surface it via the start-in-range branch of
// listByCalendarRange.
export function scheduleEndAt(schedule: EventSchedule): Date {
  if (schedule.kind === "timed") return new Date(schedule.end);
  return new Date(`${schedule.end}T00:00:00.000Z`);
}

function withinHorizon(instant: Date, horizon: ProjectionHorizon): boolean {
  return (
    instant.getTime() >= horizon.start.getTime() &&
    instant.getTime() < horizon.end.getTime()
  );
}

function occurrenceKey(eventId: EventId, startAt: Date): OccurrenceKey {
  return `${eventId}:${startAt.toISOString()}` as OccurrenceKey;
}

function dayOnlyDiff(start: string, end: string): number {
  return dayjs(`${end}T00:00:00.000Z`).diff(
    dayjs(`${start}T00:00:00.000Z`),
    "day",
  );
}
