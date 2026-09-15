import { type EventId } from "@core/types/domain-primitives";
import { type EventListQuery } from "@core/types/event-command.contracts";
import {
  type MigrationRecord,
  type OfflineDataStore,
  type StoredTask,
} from "@web/common/storage/offline-data/offline-data.store";
import {
  initializeOfflineDataStore,
  resetOfflineDataStoreForTests,
} from "@web/common/storage/offline-data/offline-data.store.registry";
import { fetchLocalEventsRange } from "@web/events/queries/event.query.local";
import { type LocalEventRecord } from "@web/events/types/local-event.record";
import { afterEach, describe, expect, it, mock } from "bun:test";

function stubStore(
  initialize: OfflineDataStore["initialize"],
  getAllEvents: OfflineDataStore["getAllEvents"],
): OfflineDataStore {
  return {
    initialize,
    isReady: () => false,
    getEvents: async (_query: EventListQuery) => [],
    getAllEvents,
    putEvent: async () => undefined,
    putEvents: async () => undefined,
    deleteEvent: async (_eventId: EventId) => undefined,
    clearAllEvents: async () => undefined,
    getAllTasks: async () => [] as StoredTask[],
    getTaskCount: async () => 0,
    clearAllTasks: async () => undefined,
    getMigrationRecords: async () => [] as MigrationRecord[],
    setMigrationRecord: async () => undefined,
  };
}

describe("fetchLocalEventsRange", () => {
  afterEach(() => {
    resetOfflineDataStoreForTests();
  });

  it("waits for store init before reading events", async () => {
    let finish: (() => void) | undefined;
    const initialize = mock(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const getAllEvents = mock(async () => [] as LocalEventRecord[]);
    resetOfflineDataStoreForTests(stubStore(initialize, getAllEvents));

    const init = initializeOfflineDataStore();
    const fetchPromise = fetchLocalEventsRange({
      startDate: "2026-05-18T00:00:00.000Z",
      endDate: "2026-05-25T00:00:00.000Z",
    });

    await Promise.resolve();
    expect(getAllEvents).not.toHaveBeenCalled();

    finish?.();
    await init;
    await fetchPromise;
    expect(getAllEvents).toHaveBeenCalledTimes(1);
  });
});
