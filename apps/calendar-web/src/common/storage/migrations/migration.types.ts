import { type OfflineDataStore } from "../offline-data/offline-data.store";

/**
 * Data migration - transforms existing data within storage.
 *
 * Data migrations work through the abstract OfflineDataStore interface,
 * making them storage-agnostic. They're tracked in the storage's
 * _migrations table and only run once.
 *
 * Use cases:
 * - Renaming fields
 * - Computing derived values
 * - Restructuring data
 *
 * Example:
 * ```typescript
 * const backfillPriorityMigration: DataMigration = {
 *   id: "backfill-priority-v1",
 *   description: "Add priority field to events missing it",
 *   async migrate(store) {
 *     const events = await store.getAllEvents();
 *     // transform and save events...
 *   }
 * };
 * ```
 */
export interface DataMigration {
  /** Unique identifier for this migration */
  id: string;
  /** Human-readable description */
  description: string;
  /** Migration function that transforms data */
  migrate: (store: OfflineDataStore) => Promise<void>;
}

/**
 * External migration - imports data from external sources.
 *
 * External migrations import data from sources outside the storage
 * store (browser key-value state, files, APIs, etc.). They're tracked via
 * persistent browser-store flags since the source may not be the offline data
 * store.
 *
 * Use cases:
 * - Migrating from localStorage to IndexedDB
 * - Importing from legacy storage formats
 * - One-time data imports
 *
 * Example:
 * ```typescript
 * const importSettingsMigration: ExternalMigration = {
 *   id: "import-settings-v1",
 *   description: "Import user settings from localStorage",
 *   async migrate(store) {
 *     const settings = persistentBrowserStore.get("settings");
 *     if (settings) {
 *       await store.putSettings(JSON.parse(settings));
 *     }
 *   }
 * };
 * ```
 */
export interface ExternalMigration {
  /** Unique identifier for this migration */
  id: string;
  /** Human-readable description */
  description: string;
  /** Migration function that imports external data */
  migrate: (store: OfflineDataStore) => Promise<void>;
  /**
   * Optional completion check.
   *
   * When provided, migration completion is only recorded if this returns true.
   * Useful for partial migrations that should retry on next startup.
   */
  isComplete?: () => boolean | Promise<boolean>;
}
