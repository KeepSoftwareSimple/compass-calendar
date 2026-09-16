import { type OfflineDataStore } from "@web/common/storage/offline-data/offline-data.store";
import { mock } from "bun:test";

/**
 * Creates a mock OfflineDataStore for tests.
 *
 * All methods default to empty results or no-op implementations.
 * Override specific methods (e.g., getAllEvents) as needed per test.
 */
type MockedOfflineDataStore = {
  [K in keyof OfflineDataStore]: OfflineDataStore[K] extends (
    ...args: infer _Args
  ) => infer _Return
    ? ReturnType<typeof mock>
    : OfflineDataStore[K];
};

export function createMockOfflineDataStore(): MockedOfflineDataStore {
  return {
    initialize: mock().mockResolvedValue(undefined),
    isReady: mock().mockReturnValue(true),
    getEvents: mock().mockResolvedValue([]),
    getAllEvents: mock().mockResolvedValue([]),
    searchByTitle: mock().mockResolvedValue([]),
    putEvent: mock().mockResolvedValue(undefined),
    putEvents: mock().mockResolvedValue(undefined),
    deleteEvent: mock().mockResolvedValue(undefined),
    clearAllEvents: mock().mockResolvedValue(undefined),
    getAllTasks: mock().mockResolvedValue([]),
    getTaskCount: mock().mockResolvedValue(0),
    clearAllTasks: mock().mockResolvedValue(undefined),
    getMigrationRecords: mock().mockResolvedValue([]),
    setMigrationRecord: mock().mockResolvedValue(undefined),
  };
}
