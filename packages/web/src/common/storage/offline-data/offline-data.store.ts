import { type EventId } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import { type EventListQuery } from "@core/types/event-command.contracts";
import { type LocalEventRecord } from "@web/events/types/local-event.record";

/**
 * Record of a completed migration.
 */
export interface MigrationRecord {
  id: string;
  completedAt: string;
}

/**
 * A task row as persisted in the legacy `tasks` table.
 *
 * The Tasks feature was removed (2026-07), but existing rows are retained in
 * IndexedDB so users can recover them on their own. This minimal row type
 * exists so the Dexie schema-upgrade path (see legacy-primary-key.
 * migration.ts) can read and re-insert those rows without data loss, and so
 * the "Export my data" command can surface them before the table is cleared.
 */
export interface StoredTask {
  _id: string;
  dateKey: string;
  title: string;
  status: "todo" | "completed";
  order: number;
  createdAt: string;
  user: string;
}

/**
 * Abstract store for structured offline event data.
 *
 * This interface defines storage operations independently of the underlying
 * storage technology (IndexedDB, SQLite, etc.). Implementations handle
 * storage-specific details like schema migrations internally.
 *
 * Benefits:
 * - Storage-agnostic application code
 * - Easy to swap implementations (IndexedDB → SQLite)
 * - Testable via mock stores
 */
export interface OfflineDataStore {
  /**
   * Initialize storage and run internal schema migrations.
   * Must be called before any other operations.
   */
  initialize(): Promise<void>;

  /**
   * Check if storage has been initialized and is ready for operations.
   */
  isReady(): boolean;

  /** Close any active storage connection. */
  close?(): void;

  // ─── Event Operations ──────────────────────────────────────────────────────

  /**
   * Get events matching a range query (B_E).
   */
  getEvents(query: EventListQuery): Promise<LocalEventRecord[]>;

  /**
   * Title substring search used by the command palette in anonymous mode.
   * Same window, cap, and ranking as the signed-in `q` list.
   */
  searchByTitle(q: string, now?: number): Promise<Event[]>;

  /**
   * Get all events without filtering.
   */
  getAllEvents(): Promise<LocalEventRecord[]>;

  /**
   * Save or update a single event record.
   */
  putEvent(record: LocalEventRecord): Promise<void>;

  /**
   * Save or update multiple event records.
   */
  putEvents(records: LocalEventRecord[]): Promise<void>;

  /**
   * Delete an event by ID.
   */
  deleteEvent(eventId: EventId): Promise<void>;

  /**
   * Clear all events from storage.
   */
  clearAllEvents(): Promise<void>;

  // ─── Task Recovery ─────────────────────────────────────────────────────────

  /**
   * Get all rows from the retained (read-only) legacy tasks table.
   */
  getAllTasks(): Promise<StoredTask[]>;

  /**
   * Cheap existence check for the retained legacy tasks table, without
   * reading every row.
   */
  getTaskCount(): Promise<number>;

  /**
   * Clear all rows from the retained legacy tasks table.
   */
  clearAllTasks(): Promise<void>;

  // ─── Migration Tracking ────────────────────────────────────────────────────

  /**
   * Get all completed migration records.
   */
  getMigrationRecords(): Promise<MigrationRecord[]>;

  /**
   * Record a migration as completed.
   */
  setMigrationRecord(id: string): Promise<void>;
}
