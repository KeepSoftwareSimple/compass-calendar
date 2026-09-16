import { dom } from "./jsdom-env";

type IndexedDbGlobals = {
  indexedDB: IDBFactory;
  IDBKeyRange: typeof IDBKeyRange;
  IDBCursor: typeof IDBCursor;
  IDBCursorWithValue: typeof IDBCursorWithValue;
  IDBDatabase: typeof IDBDatabase;
  IDBFactory: typeof IDBFactory;
  IDBIndex: typeof IDBIndex;
  IDBObjectStore: typeof IDBObjectStore;
  IDBOpenDBRequest: typeof IDBOpenDBRequest;
  IDBRequest: typeof IDBRequest;
  IDBTransaction: typeof IDBTransaction;
  IDBVersionChangeEvent: typeof IDBVersionChangeEvent;
};

let indexedDbReady: Promise<void> | undefined;
let cachedIndexedDbGlobals: IndexedDbGlobals | undefined;

function snapshotIndexedDbGlobals(): IndexedDbGlobals {
  return {
    indexedDB: globalThis.indexedDB,
    IDBKeyRange: globalThis.IDBKeyRange,
    IDBCursor: globalThis.IDBCursor,
    IDBCursorWithValue: globalThis.IDBCursorWithValue,
    IDBDatabase: globalThis.IDBDatabase,
    IDBFactory: globalThis.IDBFactory,
    IDBIndex: globalThis.IDBIndex,
    IDBObjectStore: globalThis.IDBObjectStore,
    IDBOpenDBRequest: globalThis.IDBOpenDBRequest,
    IDBRequest: globalThis.IDBRequest,
    IDBTransaction: globalThis.IDBTransaction,
    IDBVersionChangeEvent: globalThis.IDBVersionChangeEvent,
  };
}

function applyIndexedDbGlobals(globals: IndexedDbGlobals): void {
  const { window } = dom;
  for (const [key, value] of Object.entries(globals)) {
    (globalThis as unknown as Record<string, unknown>)[key] = value;
    (window as unknown as Record<string, unknown>)[key] = value;
  }
}

export async function ensureIndexedDbTestEnv(): Promise<void> {
  indexedDbReady ??= (async () => {
    await import("fake-indexeddb/auto");
    cachedIndexedDbGlobals = snapshotIndexedDbGlobals();
    applyIndexedDbGlobals(cachedIndexedDbGlobals);
  })();

  await indexedDbReady;

  // Bun `--isolate` clears globalThis while this module stays loaded.
  if (
    cachedIndexedDbGlobals &&
    globalThis.indexedDB !== cachedIndexedDbGlobals.indexedDB
  ) {
    applyIndexedDbGlobals(cachedIndexedDbGlobals);
  }
}

await ensureIndexedDbTestEnv();
