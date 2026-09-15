import { DateTimeSchema, type EventId } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import {
  type CreateEventInput,
  type EventListQuery,
  type RecurrenceScope,
  type ReplaceEventInput,
} from "@core/types/event-command.contracts";
import dayjs from "@core/util/date/dayjs";
import { getCompassEventDateFormat } from "@core/util/event/event.util";
import { shiftSeriesScheduleByOccurrenceEdit } from "@core/util/event/shift-series-schedule-by-occurrence-edit";
import { throwIfAborted } from "@web/api/util/api.util";
import { getLocalCalendarSentinelId } from "@web/calendars/local-calendar.sentinel";
import {
  ensureOfflineDataStoreReady,
  getOfflineDataStore,
  type OfflineDataStore,
} from "@web/common/storage/offline-data/offline-data.store.registry";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { expandLocalEventRecords } from "@web/events/recurrence/expandLocalEventRecords";
import {
  composeLocalOccurrenceId,
  parseLocalOccurrenceId,
} from "@web/events/recurrence/projectRecurringEdit";
import { type LocalEventRecord } from "@web/events/types/local-event.record";
import { type EventRepository } from "./event.repository.types";

/**
 * Local event repository implementation using the offline data store.
 *
 * Local (IndexedDB) mode stores one record per series and expands occurrences
 * at read time (expandLocalEventRecords), so an occurrence id is a composed
 * `${seriesId}::${start}` with no record of its own. Scoped writes against
 * such an id are applied to the series record, mirroring the backend's plans:
 * exclude the date ("this" delete), truncate the rules with UNTIL
 * ("thisAndFollowing"), or rewrite/delete the whole record ("all"). Series-
 * wide edits also drop previously stored occurrence overrides for that series
 * so a prior "this" edit cannot resurrect after promote.
 */
function nowDateTime() {
  return DateTimeSchema.parse(new Date().toISOString());
}

// RRULE UNTIL is inclusive, so truncating "everything at/after `beforeStart`"
// means UNTIL = one second before its instant. Always emits the full UTC
// timed format (matching the backend's withUntil), never a bare date: an
// all-day date-only UNTIL is compared against CompassEventRRule's
// local-timezone-anchored dtstart (mirrors parseCompassEventDate +
// `.local()`), and a bare date silently drops or keeps an extra day
// whenever the local zone's UTC offset is negative (verified across
// America/Denver, Asia/Tokyo, and UTC).
function truncateRules(
  rules: readonly string[],
  beforeStart: string,
): string[] {
  const allDay = !beforeStart.includes("T");
  const excludedInstant = allDay
    ? dayjs(beforeStart, "YYYY-MM-DD").tz(dayjs.tz.guess()).local().toDate()
    : dayjs(beforeStart).toDate();
  const until = dayjs(excludedInstant)
    .subtract(1, "second")
    .utc()
    .toRRuleDTSTARTString();

  return rules.map((rule) => {
    if (!rule.startsWith("RRULE:")) return rule;
    const kept = rule
      .slice("RRULE:".length)
      .split(";")
      .filter(
        (part) => !part.startsWith("UNTIL=") && !part.startsWith("COUNT="),
      );
    return `RRULE:${[...kept, `UNTIL=${until}`].join(";")}`;
  });
}

// Local calendars have no attendee support (a guest-edit against one is the
// backend's typed rejection, and the wire boundary in useEventMutations
// already strips content to the editable subset before any repository call),
// so the write-only guest-edit field never reaches here with a value at
// runtime. Dropping the key keeps the stored record typed to the read-side
// Event["content"], whose attendee entries carry responseStatus.
function detailsContent({
  attendees: _guestEdit,
  ...content
}: CreateEventInput["content"]): Event["content"] {
  return content;
}

// Shared by create/replace/replaceSeries: "preserve" keeps the existing
// event's recurrence (not meaningful for create, which has no existing
// event), "series"/"single" apply the input's own recurrence.
function resolveRecurrence(
  recurrence: ReplaceEventInput["recurrence"] | CreateEventInput["recurrence"],
  fallback: Event["recurrence"],
): Event["recurrence"] {
  if (recurrence.kind === "series") {
    return { kind: "series", rules: recurrence.rules };
  }
  if (recurrence.kind === "single") return { kind: "single" };
  return fallback;
}

// A series record's recurrence is guaranteed `kind === "series"` by the
// `findSeriesRecord` check below; narrowing the return type here means
// every call site can read `.rules` directly instead of re-deriving the
// same guaranteed-true ternary.
type SeriesRecord = LocalEventRecord & {
  event: Event & { recurrence: { kind: "series"; rules: readonly string[] } };
};

export class LocalEventRepository implements EventRepository {
  constructor(
    private readonly getStore: () => OfflineDataStore = getOfflineDataStore,
  ) {}

  private get store() {
    return this.getStore();
  }

  private async ensureStoreReady(): Promise<void> {
    if (this.getStore !== getOfflineDataStore) {
      return;
    }
    await ensureOfflineDataStoreReady();
  }

  async list(query: EventListQuery, signal?: AbortSignal): Promise<Event[]> {
    throwIfAborted(signal);
    await this.ensureStoreReady();
    const records = await this.store.getAllEvents();
    return expandLocalEventRecords(records, {
      start: query.start,
      end: query.end,
    }).map((record) => record.event);
  }

  private async findRecordById(
    id: string,
  ): Promise<LocalEventRecord | undefined> {
    const records = await this.store.getAllEvents();
    return records.find((r) => r.id === id);
  }

  /** The stored series record behind a composed occurrence id, if any. */
  private async findSeriesRecord(
    id: EventId,
  ): Promise<{ record: SeriesRecord; occurrenceStart: string } | null> {
    const parsed = parseLocalOccurrenceId(id);
    if (!parsed) return null;
    const record = await this.findRecordById(parsed.seriesId);
    if (!record || record.event.recurrence.kind !== "series") return null;
    return { record: record as SeriesRecord, occurrenceStart: parsed.start };
  }

  /** Drop stored `${seriesId}::*` occurrence overrides so series-wide edits
   * stick. Skips nested series records minted by thisAndFollowing splits —
   * those share the same id prefix but are independent series bases. */
  private async deleteSeriesOccurrenceOverrides(
    seriesId: string,
    options?: { atOrAfter?: string },
  ): Promise<void> {
    const prefix = `${seriesId}::`;
    const records = await this.store.getAllEvents();
    await Promise.all(
      records
        .filter((record) => {
          if (!record.id.startsWith(prefix)) return false;
          // Remainder legs from thisAndFollowing are real series records at a
          // composed id; never treat them as disposable occurrence overrides.
          if (record.event.recurrence.kind === "series") return false;
          if (!options?.atOrAfter) return true;
          const parsed = parseLocalOccurrenceId(record.id);
          return (
            parsed !== null &&
            !dayjs(parsed.start).isBefore(dayjs(options.atOrAfter))
          );
        })
        .map((record) => this.store.deleteEvent(record.id as EventId)),
    );
  }

  // Mirror backend synthesizeReplaceEvent: preserve on a composed occurrence
  // id of a live series keeps occurrence linkage, never demotes to single.
  private async recurrenceFallbackForReplace(
    id: EventId,
    existing: Event["recurrence"] | undefined,
  ): Promise<Event["recurrence"]> {
    const parsed = parseLocalOccurrenceId(id);
    if (parsed) {
      const series = await this.findRecordById(parsed.seriesId);
      if (series?.event.recurrence.kind === "series") {
        return { kind: "occurrence", seriesId: parsed.seriesId };
      }
    }
    return existing ?? { kind: "single" };
  }

  async create(input: CreateEventInput): Promise<Event> {
    await this.ensureStoreReady();
    const id = input.id ?? (createObjectIdString() as EventId);
    const now = nowDateTime();

    const event: Event = {
      id,
      calendarId: input.calendarId,
      content: detailsContent(input.content),
      schedule: input.schedule,
      recurrence: resolveRecurrence(input.recurrence, { kind: "single" }),
      createdAt: now,
      updatedAt: null,
    };

    const record: LocalEventRecord = { version: 2, id, event, isDemo: false };
    await this.store.putEvent(record);
    return event;
  }

  async replace(id: EventId, input: ReplaceEventInput): Promise<Event> {
    await this.ensureStoreReady();
    if (input.scope !== "this") {
      const series = await this.findSeriesRecord(id);
      if (series) {
        return this.replaceSeries(series.record, series.occurrenceStart, input);
      }
    }

    // The optimistic layer resolves the edit target from the react-query
    // cache, which can hold an event that never made it into IndexedDB - most
    // commonly an expanded recurring-occurrence instance (its composed id has
    // no stored record). Rather than throwing "Event not found" on that
    // mismatch, upsert: persist the edit so an offline change isn't lost
    // (read-time expansion then defers to this record for its date), falling
    // back to the local calendar when the input carries no calendarId.
    const existingRecord = await this.findRecordById(id);
    const existing = existingRecord?.event;
    const recurrenceFallback = await this.recurrenceFallbackForReplace(
      id,
      existing?.recurrence,
    );

    const event: Event = {
      id,
      calendarId:
        input.calendarId ??
        existing?.calendarId ??
        getLocalCalendarSentinelId(),
      content: detailsContent(input.content),
      schedule: input.schedule,
      recurrence: resolveRecurrence(input.recurrence, recurrenceFallback),
      createdAt: existing?.createdAt ?? nowDateTime(),
      updatedAt: nowDateTime(),
    };

    const record: LocalEventRecord = {
      version: 2,
      id,
      event,
      isDemo: existingRecord?.isDemo ?? false,
    };
    await this.store.putEvent(record);
    return event;
  }

  private async replaceSeries(
    record: SeriesRecord,
    occurrenceStart: string,
    input: ReplaceEventInput,
  ): Promise<Event> {
    // A "thisAndFollowing" edit of the first occurrence covers the whole
    // series - same upgrade the backend applies.
    const splits =
      input.scope === "thisAndFollowing" &&
      dayjs(occurrenceStart).isAfter(record.event.schedule.start);

    const recurrence = resolveRecurrence(
      input.recurrence,
      record.event.recurrence,
    );

    // Prior scope-"this" overrides would otherwise win over expansion after
    // settle and undo the series-wide shift for those instances.
    await this.deleteSeriesOccurrenceOverrides(
      record.id,
      splits ? { atOrAfter: occurrenceStart } : undefined,
    );

    if (!splits) {
      const schedule =
        input.scope === "all"
          ? shiftSeriesScheduleByOccurrenceEdit(
              record.event.schedule,
              occurrenceStart,
              input.schedule,
            )
          : input.schedule;
      const event: Event = {
        ...record.event,
        calendarId: input.calendarId ?? record.event.calendarId,
        content: detailsContent(input.content),
        schedule,
        recurrence,
        updatedAt: nowDateTime(),
      };
      await this.store.putEvent({ ...record, event });
      return event;
    }

    const truncated: Event = {
      ...record.event,
      recurrence: {
        kind: "series",
        rules: truncateRules(record.event.recurrence.rules, occurrenceStart),
      },
      updatedAt: nowDateTime(),
    };
    await this.store.putEvent({ ...record, event: truncated });

    const id = composeLocalOccurrenceId(record.id, occurrenceStart);
    const event: Event = {
      id,
      calendarId: input.calendarId ?? record.event.calendarId,
      content: detailsContent(input.content),
      schedule: input.schedule,
      recurrence,
      createdAt: nowDateTime(),
      updatedAt: null,
    };
    await this.store.putEvent({
      version: 2,
      id,
      event,
      isDemo: record.isDemo,
    });
    return event;
  }

  async delete(id: EventId, scope: RecurrenceScope): Promise<void> {
    await this.ensureStoreReady();
    const series = await this.findSeriesRecord(id);
    if (!series) {
      await this.store.deleteEvent(id);
      return;
    }
    const { record, occurrenceStart } = series;

    const coversWholeSeries =
      scope === "all" ||
      (scope === "thisAndFollowing" &&
        !dayjs(occurrenceStart).isAfter(record.event.schedule.start));
    if (coversWholeSeries) {
      await this.deleteSeriesOccurrenceOverrides(record.id);
      await this.store.deleteEvent(record.id);
      return;
    }

    if (scope === "thisAndFollowing") {
      await this.deleteSeriesOccurrenceOverrides(record.id, {
        atOrAfter: occurrenceStart,
      });
      await this.store.putEvent({
        ...record,
        event: {
          ...record.event,
          recurrence: {
            kind: "series",
            rules: truncateRules(
              record.event.recurrence.rules,
              occurrenceStart,
            ),
          },
          updatedAt: nowDateTime(),
        },
      });
      return;
    }

    // "this": exclude the date from expansion, and drop any stored override
    // record for this occurrence so it can't resurface via the id dedupe.
    // Occurrence ids embed a canonical ISO recurrenceId (Z / midnight-Z);
    // expansion skips by schedule.start format (RFC3339 offset or YYYY-MM-DD),
    // so normalize before storing.
    const format = getCompassEventDateFormat(record.event.schedule.start);
    const exdate = dayjs(occurrenceStart).format(format);
    await this.store.deleteEvent(id);
    await this.store.putEvent({
      ...record,
      exdates: [...(record.exdates ?? []), exdate],
    });
  }
}
