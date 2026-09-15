import { type EventId } from "@core/types/domain-primitives";
import { type EventListQuery } from "@core/types/event-command.contracts";
import { type LocalEventRecord } from "@web/events/types/local-event.record";
import {
  type MigrationRecord,
  type OfflineDataStore,
  type StoredTask,
} from "./offline-data.store";
import {
  getOfflineDataStore,
  initializeOfflineDataStore,
  resetOfflineDataStoreForTests,
} from "./offline-data.store.registry";
import { afterEach, describe, expect, it, mock } from "bun:test";

function stubStore(
  initialize: OfflineDataStore["initialize"],
): OfflineDataStore {
  return {
    initialize,
    isReady: () => true,
    getEvents: async (_query: EventListQuery) => [],
    getAllEvents: async () => [] as LocalEventRecord[],
    searchByTitle: async () => [],
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

describe("initializeOfflineDataStore", () => {
  afterEach(() => {
    localStorage.clear();
    resetOfflineDataStoreForTests();
  });

  it("retries after a failed initialize instead of sticking on the rejected promise", async () => {
    const initialize = mock()
      .mockRejectedValueOnce(new DOMException("Blocked", "SecurityError"))
      .mockResolvedValueOnce(undefined);
    resetOfflineDataStoreForTests(stubStore(initialize));

    await expect(initializeOfflineDataStore()).rejects.toMatchObject({
      name: "SecurityError",
    });
    expect(initialize).toHaveBeenCalledTimes(1);

    await expect(initializeOfflineDataStore()).resolves.toBeUndefined();
    expect(initialize).toHaveBeenCalledTimes(2);
  });

  it("reuses one in-flight initialize across callers", async () => {
    let finish: (() => void) | undefined;
    const initialize = mock(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    resetOfflineDataStoreForTests(stubStore(initialize));

    const first = initializeOfflineDataStore();
    const second = initializeOfflineDataStore();
    expect(initialize).toHaveBeenCalledTimes(1);

    finish?.();
    await Promise.all([first, second]);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(getOfflineDataStore()).toBe(getOfflineDataStore());
  });
});
