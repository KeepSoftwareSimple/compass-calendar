import {
  ensureOfflineDataStoreReady,
  getOfflineDataStore,
} from "@web/common/storage/offline-data/offline-data.store.registry";

/** Local non-demo events on device at signup click time (anonymous investment). */
export async function countLocalNonDemoEvents(): Promise<number> {
  await ensureOfflineDataStoreReady();
  const records = await getOfflineDataStore().getAllEvents();
  return records.filter((record) => !record.isDemo).length;
}
