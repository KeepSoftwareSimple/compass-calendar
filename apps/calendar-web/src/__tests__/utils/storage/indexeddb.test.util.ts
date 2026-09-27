const COMPASS_LOCAL_DB_NAME = "compass-local";

export async function deleteCompassLocalDb(): Promise<void> {
  const idb = globalThis.indexedDB;
  if (!idb) {
    return;
  }

  await new Promise<void>((resolve) => {
    const request = idb.deleteDatabase(COMPASS_LOCAL_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}
