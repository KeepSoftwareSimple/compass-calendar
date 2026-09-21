import Dexie, { type Table } from "dexie";
import {
  eventTitleSearchWindow,
  searchEventsByTitle,
} from "@core/event/search-events-by-title";
import { type EventId } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import { type EventListQuery } from "@core/types/event-command.contracts";
import { getLocalCalendarSentinelId } from "@web/calendars/local-calendar.sentinel";
import { transformLegacyEvents } from "@web/common/storage/migrations/data/legacy-event-to-local-record.transform";
import { expandLocalEventRecords } from "@web/events/recurrence/expandLocalEventRecords";
import { type LocalEventRecord } from "@web/events/types/local-event.record";
import {
  deleteCompassLocalDb,
  extractDataFromLegacySchema,
  isPrimaryKeyUpgradeError,
} from "./legacy-primary-key.migration";
import {
  type MigrationRecord,
  type OfflineDataStore,
  type StoredTask,
} from "./offline-data.store";

/**
 * Dexie database schema for Compass local storage.
 *
 * Schema versioning is handled by Dexie's built-in version() method.
 */
class CompassDB extends Dexie {
  events!: Table<LocalEventRecord, string>;
  // The Tasks feature was removed (2026-07). This table is intentionally kept
  // in the version chain so existing task rows are preserved (never dropped)
  // and users can recover their data via the "Export my data" command.
  tasks!: Table<StoredTask, string>;
  _migrations!: Table<MigrationRecord, string>;

  constructor() {
    super("compass-local");

    // Version 1: events table only
    this.version(1).stores({
      events: "_id, startDate, endDate, isSomeday",
    });

    // Version 2: add tasks table
    this.version(2).stores({
      events: "_id, startDate, endDate, isSomeday",
      tasks: "_id, dateKey, status, order",
    });

    // Version 3: add migrations tracking table
    this.version(3).stores({
      events: "_id, startDate, endDate, isSomeday",
      tasks: "_id, dateKey, status, order",
      _migrations: "id",
    });

    // Version 4 (B13): events store LocalEventRecord ({ version, id, event,
    // isDemo }), keyed by "id", indexed on the nested schedule so range
    // reads can use `event.schedule.start` instead of a full scan.
    // The primary key rename from "_id" to "id" is not an in-place Dexie
    // upgrade (see isPrimaryKeyUpgradeError); rows are migrated in
    // migrateFromLegacySchema below.
    this.version(4).stores({
      events:
        "id, event.schedule.kind, event.schedule.start, event.schedule.end",
      tasks: "_id, dateKey, status, order",
      _migrations: "id",
    });

    // Version 5: the "someday" schedule kind was removed. Purge any local
    // records that still carry it so the events table only ever holds
    // timed/allDay schedules (the read/write paths no longer handle someday).
    this.version(5)
      .stores({
        events:
          "id, event.schedule.kind, event.schedule.start, event.schedule.end",
        tasks: "_id, dateKey, status, order",
        _migrations: "id",
      })
      .upgrade(async (tx) => {
        await tx
          .table<LocalEventRecord, string>("events")
          .filter(
            (record) =>
              (record.event?.schedule as { kind?: string } | undefined)
                ?.kind === "someday",
          )
          .delete();
      });
  }
}

/**
 * IndexedDB implementation of OfflineDataStore using Dexie.
 *
 * This store encapsulates all IndexedDB-specific logic, including:
 * - Schema versioning via Dexie
 * - Dexie transaction management
 * - Query optimization using indexes
 */
export class IndexedDbOfflineDataStore implements OfflineDataStore {
  private db = new CompassDB();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized && this.db.isOpen()) {
      return;
    }

    try {
      await this.db.open();
    } catch (error) {
      if (!isPrimaryKeyUpgradeError(error)) {
        throw error;
      }

      await this.migrateFromLegacySchema();
    }

    this.initialized = true;
  }

  /**
   * Handle UpgradeError from a legacy DB whose primary key(s) Dexie cannot
   * rename in place: tasks used "id" instead of "_id", and/or events used
   * "_id" with flat fields instead of "id" with a nested LocalEventRecord
   * (B13). Read data with the legacy schema, delete the DB, re-open with
   * the current schema, transform and re-insert.
   */
  private async migrateFromLegacySchema(): Promise<void> {
    const { events, tasks, migrations } = await extractDataFromLegacySchema();
    await deleteCompassLocalDb();
    await this.db.open();

    const sentinelCalendarId = getLocalCalendarSentinelId();
    const eventRecords = transformLegacyEvents(events, sentinelCalendarId);

    if (eventRecords.length > 0 || tasks.length > 0 || migrations.length > 0) {
      await this.db.transaction(
        "rw",
        this.db.events,
        this.db.tasks,
        this.db._migrations,
        async () => {
          if (eventRecords.length > 0) {
            await this.db.events.bulkPut(eventRecords);
          }
          if (tasks.length > 0) {
            await this.db.tasks.bulkPut(tasks);
          }
          if (migrations.length > 0) {
            await this.db._migrations.bulkPut(migrations);
          }
        },
      );
      // biome-ignore lint/suspicious/noConsole: Preserve local migration summary output.
      console.log(
        `[Migration] Migrated ${eventRecords.length} events and ${tasks.length} tasks from legacy schema`,
      );
    }
  }

  isReady(): boolean {
    return this.initialized && this.db.isOpen();
  }

  close(): void {
    this.db.close();
    this.initialized = false;
  }

  // ─── Event Operations ──────────────────────────────────────────────────────

  async getEvents(query: EventListQuery): Promise<LocalEventRecord[]> {
    const start = Date.parse(query.start);
    const end = Date.parse(query.end);
    const allDayStart = query.start.slice(0, 10);
    const allDayEnd = query.end.slice(0, 10);

    // Timed starts are offset ISO strings; lexicographic order is not
    // chronological across time zones, so the start index is unsafe for the
    // timed overlap gate. Use the kind index + Date.parse (same semantics as
    // eventMatchesRange). All-day YYYY-MM-DD starts are chronological, so the
    // start index can narrow candidates before the end-bound check.
    const [timed, allDay] = await Promise.all([
      this.db.events
        .where("event.schedule.kind")
        .equals("timed")
        .filter((record) => {
          const schedule = record.event.schedule;
          if (schedule.kind !== "timed") return false;
          return (
            Date.parse(schedule.start) < end && Date.parse(schedule.end) > start
          );
        })
        .toArray(),
      this.db.events
        .where("event.schedule.start")
        .below(allDayEnd)
        .and((record) => {
          if (record.event.schedule.kind !== "allDay") return false;
          return record.event.schedule.end > allDayStart;
        })
        .toArray(),
    ]);

    return timed.concat(allDay);
  }

  async getAllEvents(): Promise<LocalEventRecord[]> {
    return this.db.events.toArray();
  }

  async searchByTitle(q: string, now = Date.now()): Promise<Event[]> {
    const window = eventTitleSearchWindow(now);
    const records = await this.getAllEvents();
    return searchEventsByTitle(
      (await expandLocalEventRecords(records, window)).map(
        (record) => record.event,
      ),
      q,
      now,
    );
  }

  async putEvent(record: LocalEventRecord): Promise<void> {
    await this.db.events.put(record);
  }

  async putEvents(records: LocalEventRecord[]): Promise<void> {
    if (records.length > 0) {
      await this.db.events.bulkPut(records);
    }
  }

  async deleteEvent(eventId: EventId): Promise<void> {
    await this.db.events.delete(eventId);
  }

  async clearAllEvents(): Promise<void> {
    await this.db.events.clear();
  }

  // ─── Task Recovery ─────────────────────────────────────────────────────────

  async getAllTasks(): Promise<StoredTask[]> {
    return this.db.tasks.toArray();
  }

  async getTaskCount(): Promise<number> {
    return this.db.tasks.count();
  }

  async clearAllTasks(): Promise<void> {
    await this.db.tasks.clear();
  }

  // ─── Migration Tracking ────────────────────────────────────────────────────

  async getMigrationRecords(): Promise<MigrationRecord[]> {
    return this.db._migrations.toArray();
  }

  async setMigrationRecord(id: string): Promise<void> {
    await this.db._migrations.put({
      id,
      completedAt: new Date().toISOString(),
    });
  }
}
