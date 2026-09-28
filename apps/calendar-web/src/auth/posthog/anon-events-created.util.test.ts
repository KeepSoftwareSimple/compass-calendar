import { type LocalEventRecord } from "@web/events/types/local-event.record";
import { afterEach, describe, expect, it, mock } from "bun:test";

const getAllEvents = mock(async (): Promise<LocalEventRecord[]> => []);
const ensureOfflineDataStoreReady = mock(async () => {});

mock.module(
  "@web/common/storage/offline-data/offline-data.store.registry",
  () => ({
    ensureOfflineDataStoreReady,
    getOfflineDataStore: () => ({ getAllEvents }),
  }),
);

const { countLocalNonDemoEvents } = await import(
  "@web/auth/posthog/anon-events-created.util"
);

describe("countLocalNonDemoEvents", () => {
  afterEach(() => {
    getAllEvents.mockClear();
    ensureOfflineDataStoreReady.mockClear();
  });

  it("counts only non-demo local events", async () => {
    getAllEvents.mockResolvedValueOnce([
      { isDemo: true } as LocalEventRecord,
      { isDemo: false } as LocalEventRecord,
      { isDemo: false } as LocalEventRecord,
    ]);

    await expect(countLocalNonDemoEvents()).resolves.toBe(2);
    expect(ensureOfflineDataStoreReady).toHaveBeenCalledTimes(1);
  });
});
