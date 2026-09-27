import { type CreateEventInput } from "@core/types/event-command.contracts";
import dayjs from "@core/util/date/dayjs";
import { looksLikeOccurrenceId } from "@core/util/occurrence-id";
import { CalendarApi } from "@web/api/calendar.api";
import { getDefaultTargetCalendar } from "@web/calendars/calendar.util";
import { type OfflineDataStore } from "@web/common/storage/offline-data/offline-data.store";
import {
  ensureOfflineDataStoreReady,
  getOfflineDataStore,
} from "@web/common/storage/offline-data/offline-data.store.registry";
import { EventApi } from "@web/events/event.api";
import { editableContent } from "@web/events/grid-event-draft.adapter";
import { type LocalEventRecord } from "@web/events/types/local-event.record";

type LocalEventSyncStorage = Pick<
  OfflineDataStore,
  "clearAllEvents" | "deleteEvent" | "getAllEvents"
>;

type LocalEventSyncDependencies = {
  createEvent: typeof EventApi.create;
  listCalendars: typeof CalendarApi.list;
  ensureOfflineDataStoreReady: typeof ensureOfflineDataStoreReady;
  getOfflineDataStore: () => LocalEventSyncStorage;
};

// Occurrences a local "delete this occurrence" excluded from the series
// (LocalEventRepository stores them as bare start dates on the record, never
// materializing a per-instance row) survive promotion as RFC5545 EXDATE lines
// appended to the RRULE text - materializeSeriesInstances parses the whole
// `rules` array as one iCalendar text block, so this is the same mechanism
// UNTIL truncation already relies on. Without this, a locally-deleted
// occurrence would silently resurrect once the series is promoted.
//
// Always the full UTC timed format (never a bare date), anchored the same
// way the backend's own getAnchorDate anchors an all-day series (midnight
// UTC of the date) - matching instants exactly, since materializeSeriesInstances
// generates each occurrence as an offset from that same anchor.
function exdateLines(
  exdates: readonly string[] | undefined,
  allDay: boolean,
): string[] {
  if (!exdates || exdates.length === 0) return [];
  return exdates.map((date) => {
    const instant = allDay ? dayjs(`${date}T00:00:00.000Z`) : dayjs(date).utc();
    return `EXDATE:${instant.toRRuleDTSTARTString()}`;
  });
}

// Maps a locally-stored record (calendarId = the client-generated sentinel)
// onto the resolved target calendar id, preserving the client-generated event
// id.
function toCreateInput(
  record: LocalEventRecord,
  targetCalendarId: string,
): CreateEventInput {
  const recurrence = record.event.recurrence;
  const allDay = record.event.schedule.kind === "allDay";
  // Local storage only ever holds "details" content (never a synthesized
  // "busy" block), so this narrowing cast is safe - but its location is
  // read-side optional/nullable (a record predating this field, or one that
  // never had a location), while CreateEventInput requires a definite
  // string, so it needs the same default every other editable-content
  // consumer uses.
  const content = record.event.content as Extract<
    typeof record.event.content,
    { kind: "details" }
  >;

  return {
    // Composed occurrence ids (`${seriesId}::${start}`, minted by local-mode
    // series expansion) aren't valid server ids - let the backend generate
    // one instead of rejecting the POST.
    id: looksLikeOccurrenceId(record.event.id) ? undefined : record.event.id,
    calendarId: targetCalendarId as CreateEventInput["calendarId"],
    schedule: record.event.schedule,
    recurrence:
      recurrence.kind === "series"
        ? {
            kind: "series",
            rules: [
              ...recurrence.rules,
              ...exdateLines(record.exdates, allDay),
            ],
          }
        : { kind: "single" },
    content: editableContent(content),
  };
}

export function createSyncLocalEventsToCloud({
  createEvent,
  listCalendars,
  ensureOfflineDataStoreReady,
  getOfflineDataStore,
}: LocalEventSyncDependencies) {
  return async function syncLocalEventsToCloud(): Promise<number> {
    await ensureOfflineDataStoreReady();
    const store = getOfflineDataStore();
    const records = await store.getAllEvents();

    if (records.length === 0) {
      return 0;
    }

    const recordsToSync = records.filter((record) => !record.isDemo);

    if (recordsToSync.length > 0) {
      const calendars = await listCalendars();
      // A connected Google account's primary calendar wins over the local
      // calendar so promoted events land on the provider the user actually
      // connected, not on the calendar the sidebar is trying to stop showing.
      // Falls back to local for anonymous/password-only sign-in, where it's
      // still the only writable calendar there is.
      const targetCalendar = getDefaultTargetCalendar(calendars);

      // Never fall back to the client-generated sentinel calendar id: the
      // backend can't resolve it and rejects the POST with CALENDAR_NOT_FOUND
      // (a 404 that used to sign the just-signed-up user out). When no
      // writable calendar is available yet, keep the records on-device -
      // untouched, so a later sync can push them onto the real calendar -
      // rather than losing them to a rejected request.
      if (!targetCalendar) {
        return 0;
      }

      for (const record of recordsToSync) {
        await createEvent(toCreateInput(record, targetCalendar.id));
        // Drop each promoted row immediately so a mid-batch interrupt does not
        // re-POST already-cloud events on the next resume.
        await store.deleteEvent(record.id);
      }
    }

    // Demo rows (and any leftover) are never promoted — wipe them once the
    // user batch finished without throwing.
    await store.clearAllEvents();

    return recordsToSync.length;
  };
}

export const syncLocalEventsToCloud = createSyncLocalEventsToCloud({
  createEvent: EventApi.create,
  listCalendars: CalendarApi.list,
  ensureOfflineDataStoreReady,
  getOfflineDataStore,
});
