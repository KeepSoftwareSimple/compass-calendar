import { type ValidatedCompassEvent } from "@core/types/compass-event.contracts";
import { type CalendarId, EventIdSchema } from "@core/types/domain-primitives";
import { type EventRecurrence } from "@core/types/event.contracts";
import { getBrowserTimeZone } from "@web/common/utils/datetime/web.date.util";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import {
  type LocalEventRecord,
  LocalEventRecordSchema,
} from "@web/events/types/local-event.record";

/** Web-side mirror of `__compassDemoEvent` on legacy local-store rows. */
const LEGACY_DEMO_EVENT_FIELD = "__compassDemoEvent";

type LegacyLocalEvent = ValidatedCompassEvent & {
  [LEGACY_DEMO_EVENT_FIELD]?: true;
  order?: number;
  // Historical flag on legacy rows; the "someday" kind has been removed, so
  // rows still carrying it are dropped during migration.
  isSomeday?: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toDateOnly(value: string): string {
  return value.slice(0, 10);
}

function resolveRecurrence(legacy: LegacyLocalEvent): EventRecurrence {
  const rec = legacy.recurrence;
  if (!rec) return { kind: "single" };

  if (Array.isArray(rec.rule) && rec.rule.length > 0) {
    return { kind: "series", rules: rec.rule };
  }

  if (typeof rec.eventId === "string" && rec.eventId.length > 0) {
    const parsed = EventIdSchema.safeParse(rec.eventId);
    if (parsed.success) {
      return { kind: "occurrence", seriesId: parsed.data };
    }
  }

  return { kind: "single" };
}

type ScheduleCandidate =
  | { kind: "timed"; start: string; end: string; timeZone: string }
  | { kind: "allDay"; start: string; end: string };

function resolveSchedule(legacy: LegacyLocalEvent): ScheduleCandidate | null {
  const { startDate, endDate } = legacy;
  if (!startDate || !endDate) return null;

  // The "someday" schedule kind has been removed; legacy someday rows are
  // dropped rather than migrated.
  if (legacy.isSomeday) return null;

  if (legacy.isAllDay) {
    let end = toDateOnly(endDate);
    const start = toDateOnly(startDate);
    if (end === start) {
      end = new Date(Date.parse(start) + DAY_MS).toISOString().slice(0, 10);
    }
    return { kind: "allDay", start, end };
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  if (end.getTime() <= start.getTime()) return null;

  return {
    kind: "timed",
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone: getBrowserTimeZone(),
  };
}

function resolveCreatedAt(id: string): string {
  // ObjectId timestamps are the first four bytes. Invalid ids fall back to
  // now, matching the previous `new ObjectId(id)` throw path.
  if (!/^[0-9a-f]{24}$/i.test(id)) return new Date().toISOString();
  const seconds = Number.parseInt(id.slice(0, 8), 16);
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
}

function resolveUpdatedAt(legacy: LegacyLocalEvent): string | null {
  if (!legacy.updatedAt) return null;
  const date =
    legacy.updatedAt instanceof Date
      ? legacy.updatedAt
      : new Date(legacy.updatedAt);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Transforms one legacy local-store event row into a `LocalEventRecord`
 * (B13). Returns null when the row cannot be reasonably interpreted (missing
 * or unparseable dates) — the caller drops these rather than failing the
 * whole migration.
 */
export function transformLegacyEventToLocalRecord(
  legacy: LegacyLocalEvent,
  sentinelCalendarId: CalendarId,
): LocalEventRecord | null {
  const schedule = resolveSchedule(legacy);
  if (!schedule) return null;

  const id = EventIdSchema.safeParse(legacy._id ?? createObjectIdString());
  if (!id.success) return null;

  const candidate = {
    version: 2 as const,
    id: id.data,
    event: {
      id: id.data,
      calendarId: sentinelCalendarId,
      content: {
        kind: "details" as const,
        title: legacy.title ?? "",
        description: legacy.description ?? "",
      },
      schedule,
      recurrence: resolveRecurrence(legacy),
      createdAt: resolveCreatedAt(id.data),
      updatedAt: resolveUpdatedAt(legacy),
    },
    isDemo: legacy[LEGACY_DEMO_EVENT_FIELD] === true,
  };

  const parsed = LocalEventRecordSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * Transforms a batch of legacy rows into `LocalEventRecord`s, dropping any row
 * that cannot be interpreted (including legacy someday rows, which are no
 * longer a supported schedule kind).
 */
export function transformLegacyEvents(
  legacyEvents: LegacyLocalEvent[],
  sentinelCalendarId: CalendarId,
): LocalEventRecord[] {
  return legacyEvents
    .map((legacy) =>
      transformLegacyEventToLocalRecord(legacy, sentinelCalendarId),
    )
    .filter((record): record is LocalEventRecord => record !== null);
}
