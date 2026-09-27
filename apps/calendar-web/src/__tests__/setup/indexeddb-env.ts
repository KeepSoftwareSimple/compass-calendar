import { dom } from "./jsdom-env";

let indexedDbReady: Promise<void> | undefined;

function mirrorIndexedDbGlobals(): void {
  const { window } = dom;

  globalThis.indexedDB = window.indexedDB;
  globalThis.IDBKeyRange = window.IDBKeyRange;
  globalThis.IDBCursor = window.IDBCursor;
  globalThis.IDBCursorWithValue = window.IDBCursorWithValue;
  globalThis.IDBDatabase = window.IDBDatabase;
  globalThis.IDBFactory = window.IDBFactory;
  globalThis.IDBIndex = window.IDBIndex;
  globalThis.IDBObjectStore = window.IDBObjectStore;
  globalThis.IDBOpenDBRequest = window.IDBOpenDBRequest;
  globalThis.IDBRequest = window.IDBRequest;
  globalThis.IDBTransaction = window.IDBTransaction;
  globalThis.IDBVersionChangeEvent = window.IDBVersionChangeEvent;
}

export async function ensureIndexedDbTestEnv(): Promise<void> {
  indexedDbReady ??= (async () => {
    await import("fake-indexeddb/auto");
    mirrorIndexedDbGlobals();
  })();

  await indexedDbReady;

  // Bun parallel `--isolate` can clear globals after the first mirror while
  // this module stays loaded, so re-apply whenever indexedDB is missing.
  if (!globalThis.indexedDB) {
    mirrorIndexedDbGlobals();
  }
}

await ensureIndexedDbTestEnv();
