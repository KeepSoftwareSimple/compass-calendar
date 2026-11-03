import { type EventId } from "@core/types/domain-primitives";
import { type EventListQuery } from "@core/types/event-command.contracts";
import { type StoredTask } from "@web/common/storage/offline-data/offline-data.store";
import {
  type MigrationRecord,
  type OfflineDataStore,
} from "@web/common/storage/offline-data/offline-data.store.registry";
import { LocalEventRepository } from "@web/events/repositories/local.event.repository";
import { type LocalEventRecord } from "@web/events/types/local-event.record";

/** In-memory IndexedDB stand-in for characterization tests of the local stack. */
export function createInMemoryLocalEventStack() {
  let stored: LocalEventRecord[] = [];

  const store: OfflineDataStore = {
    initialize: async () => undefined,
    isReady: () => true,
    getEvents: async (_query: EventListQuery) => stored,
    getAllEvents: async () => stored,
    searchByTitle: async () => [],
    putEvent: async (record: LocalEventRecord) => {
      stored = [
        ...stored.filter((candidate) => candidate.id !== record.id),
        record,
      ];
    },
    putEvents: async (records: LocalEventRecord[]) => {
      for (const record of records) {
        await store.putEvent(record);
      }
    },
    deleteEvent: async (id: EventId) => {
      stored = stored.filter((candidate) => candidate.id !== id);
    },
    clearAllEvents: async () => {
      stored = [];
    },
    getAllTasks: async () => [] as StoredTask[],
    getTaskCount: async () => 0,
    clearAllTasks: async () => undefined,
    getMigrationRecords: async () => [] as MigrationRecord[],
    setMigrationRecord: async () => undefined,
  };

  const repository = new LocalEventRepository(() => store);

  return {
    repository,
    getStored: () => stored,
    replaceStored: (next: LocalEventRecord[]) => {
      stored = next;
    },
    store,
  };
}
