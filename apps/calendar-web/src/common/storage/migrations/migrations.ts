import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { type OfflineDataStore } from "../offline-data/offline-data.store";
import { demoDataSeedMigration } from "./external/demo-data-seed";
import { type DataMigration, type ExternalMigration } from "./migration.types";

// ─── Migration Registry ──────────────────────────────────────────────────────
// Add new migrations to these arrays. They run in order.

/**
 * Data migrations transform existing data within storage.
 * Tracked via the offline data store's migration records.
 */
export const dataMigrations: DataMigration[] = [];

/**
 * External migrations import data from outside storage.
 * Tracked via localStorage flags.
 */
export const externalMigrations: ExternalMigration[] = [demoDataSeedMigration];

// ─── Migration Runners ───────────────────────────────────────────────────────

/**
 * Run all pending data migrations.
 *
 * Data migrations are tracked in the offline data store's _migrations table.
 * Each migration only runs once - its ID is recorded after completion.
 */
export async function runDataMigrations(
  store: OfflineDataStore,
): Promise<void> {
  if (dataMigrations.length === 0) return;

  const completedRecords = await store.getMigrationRecords();
  const completedIds = new Set(completedRecords.map((r) => r.id));

  for (const migration of dataMigrations) {
    if (completedIds.has(migration.id)) {
      continue;
    }

    try {
      await migration.migrate(store);
      await store.setMigrationRecord(migration.id);
    } catch (error) {
      console.error(`[Migration] Failed: ${migration.id}`, error);
      throw error; // Data migrations are critical - fail fast
    }
  }
}

/**
 * Run all pending external migrations.
 *
 * External migrations are tracked via localStorage flags since they
 * import data from sources outside the offline data store. Failures are
 * logged but don't block app startup - data stays in source for retry.
 */
export async function runExternalMigrations(
  store: OfflineDataStore,
): Promise<void> {
  if (!persistentBrowserStore.isAvailable()) {
    return;
  }

  for (const migration of externalMigrations) {
    const flagKey = `compass.migration.${migration.id}`;

    if (persistentBrowserStore.get(flagKey) === "completed") {
      continue;
    }

    try {
      await migration.migrate(store);
      const isComplete = migration.isComplete
        ? await migration.isComplete()
        : true;

      if (!isComplete) {
        console.warn(`[Migration] Incomplete (will retry): ${migration.id}`);
        continue;
      }

      persistentBrowserStore.set(flagKey, "completed");
    } catch (error) {
      // External migrations are non-blocking - data stays in source for retry
      console.error(
        `[Migration] Failed (non-blocking): ${migration.id}`,
        error,
      );
    }
  }
}

/**
 * Run all migrations in the correct order.
 *
 * Order:
 * 1. Data migrations (storage-agnostic transformations)
 * 2. External migrations (imports from localStorage, etc.)
 */
export async function runAllMigrations(store: OfflineDataStore): Promise<void> {
  await runDataMigrations(store);
  await runExternalMigrations(store);
}

// Re-export types for convenience
export type { DataMigration, ExternalMigration } from "./migration.types";
