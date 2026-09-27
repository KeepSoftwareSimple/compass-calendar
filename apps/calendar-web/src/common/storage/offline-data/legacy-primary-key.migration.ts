import Dexie, { type Table } from "dexie";
import { type ValidatedCompassEvent } from "@core/types/compass-event.contracts";
import { type MigrationRecord, type StoredTask } from "./offline-data.store";

const DB_NAME = "compass-local";

/**
 * Detect a Dexie UpgradeError from a schema change Dexie cannot apply
 * in-place (e.g. a table's primary key changing name/shape). Both the
 * tasks "id" → "_id" rename and the v4 events restructure
 * ("_id" → "id", flat fields → { version, id, event, isDemo }) trigger this.
 */
export function isPrimaryKeyUpgradeError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "UpgradeError" &&
    error.message.includes("changing primary key")
  );
}

/** Tasks table shape from legacy schema (primary key was "id" not "_id"). */
type LegacyStoredTask = Omit<StoredTask, "_id"> & { id: string };

/**
 * Dexie database matching the OLD CompassLocalDB schema (events keyed by
 * "_id" with flat fields, tasks keyed by "id"). Used only to read and
 * migrate data when UpgradeError occurs opening the current schema.
 *
 * @internal Exported for testing
 */
export class LegacyCompassDB extends Dexie {
  events!: Table<ValidatedCompassEvent, string>;
  tasks!: Table<LegacyStoredTask, string>;
  _migrations!: Table<MigrationRecord, string>;

  constructor(dbName = DB_NAME) {
    super(dbName);
    this.version(1).stores({
      events: "_id, startDate, endDate, isSomeday",
    });
    this.version(2).stores({
      events: "_id, startDate, endDate, isSomeday",
      tasks: "id, dateKey, status, order",
    });
    this.version(3).stores({
      events: "_id, startDate, endDate, isSomeday",
      tasks: "_id, dateKey, status, order",
      _migrations: "id",
    });
  }
}

function legacyTaskToStoredTask(legacy: LegacyStoredTask): StoredTask {
  const { id, ...rest } = legacy;
  return { ...rest, _id: id } as StoredTask;
}

export interface LegacyMigrationResult {
  events: ValidatedCompassEvent[];
  tasks: StoredTask[];
  migrations: MigrationRecord[];
}

/**
 * Extract all events, tasks, and completed-migration records from a
 * database using a legacy schema (events with flat fields keyed by "_id",
 * tasks possibly keyed by "id" instead of "_id").
 */
export async function extractDataFromLegacySchema(): Promise<LegacyMigrationResult> {
  const legacyDb = new LegacyCompassDB();
  await legacyDb.open();

  const [events, legacyTasks, migrations] = await Promise.all([
    legacyDb.events.toArray(),
    legacyDb.tasks.toArray(),
    legacyDb._migrations ? legacyDb._migrations.toArray() : Promise.resolve([]),
  ]);

  // Tasks may already be keyed by "_id" (post task-migration) or still by
  // "id" (pre-migration); normalize either shape to StoredTask.
  const tasks: StoredTask[] = legacyTasks.map((task) =>
    "id" in task && !("_id" in task)
      ? legacyTaskToStoredTask(task as LegacyStoredTask)
      : (task as unknown as StoredTask),
  );
  legacyDb.close();

  return { events, tasks, migrations };
}

export async function deleteCompassLocalDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => {
      console.warn(
        "[deleteCompassLocalDb] Deletion blocked: waiting for other connections to close. Ensure all DB connections are closed before retrying.",
      );
    };
  });
}
