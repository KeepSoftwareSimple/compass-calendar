import { expect, type Page } from "@playwright/test";

const LOCAL_DB_NAME = "compass-local";
const LOCAL_CALENDAR_ID_KEY = "compass.localCalendarId";

/**
 * A `LocalEventRecord.event` body minus `calendarId`: anonymous mode mints the
 * local calendar at boot, so the id is only knowable once the app has started.
 * The record envelope (`version`, `isDemo`) and the invariant `recurrence` /
 * `updatedAt` defaults are owned by {@link seedLocalEvents}.
 */
export type LocalEventSeed = {
  id: string;
  content: Record<string, unknown>;
  schedule: Record<string, unknown>;
  createdAt: string;
  recurrence?: Record<string, unknown>;
  updatedAt?: string | null;
};

/** Wait for anonymous-mode boot to mint the local calendar, then return its id. */
export async function waitForLocalCalendarId(page: Page): Promise<string> {
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), LOCAL_CALENDAR_ID_KEY),
    )
    .not.toBeNull();
  const calendarId = await page.evaluate(
    (key) => localStorage.getItem(key),
    LOCAL_CALENDAR_ID_KEY,
  );
  if (!calendarId) throw new Error("missing local calendar id");
  return calendarId;
}

/**
 * Write already-complete `LocalEventRecord` rows into the anonymous-mode store.
 * Use this for fixtures that already carry their own `calendarId`; seeds built
 * against the booted calendar should go through {@link seedLocalEvents}.
 */
export async function putLocalEventRecords(
  page: Page,
  records: readonly unknown[],
  options: { replaceAll?: boolean } = {},
): Promise<void> {
  await page.evaluate(
    async ({ dbName, replaceAll, rows }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("events", "readwrite");
          const store = tx.objectStore("events");
          if (replaceAll) store.clear();
          for (const row of rows) {
            store.put(row);
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    },
    {
      dbName: LOCAL_DB_NAME,
      replaceAll: options.replaceAll === true,
      rows: records,
    },
  );
}

/**
 * Seed events onto the calendar anonymous mode minted at boot. The caller still
 * owns the reload (or whatever else republishes the store) afterwards.
 */
export async function seedLocalEvents(
  page: Page,
  events: readonly LocalEventSeed[],
  options: { replaceAll?: boolean } = {},
): Promise<void> {
  const calendarId = await waitForLocalCalendarId(page);
  const records = events.map(({ id, ...event }) => ({
    version: 2,
    id,
    isDemo: false,
    event: {
      id,
      calendarId,
      recurrence: { kind: "single" },
      updatedAt: null,
      ...event,
    },
  }));
  await putLocalEventRecords(page, records, options);
}
