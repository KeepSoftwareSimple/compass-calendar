/**
 * Tests for the migration runners.
 */

import { createMockOfflineDataStore } from "@web/__tests__/utils/storage/mock-offline-data-store.util";
import { DEMO_DATA_SEED_FLAG_KEY } from "@web/common/storage/migrations/external/demo-data-seed";
import {
  runAllMigrations,
  runDataMigrations,
  runExternalMigrations,
} from "@web/common/storage/migrations/migrations";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

describe("storage migrations", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let consoleWarnSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    localStorage.removeItem(DEMO_DATA_SEED_FLAG_KEY);
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    localStorage.removeItem(DEMO_DATA_SEED_FLAG_KEY);
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe("runDataMigrations", () => {
    it("resolves without error when there are no data migrations", async () => {
      const store = createMockOfflineDataStore();

      await expect(runDataMigrations(store)).resolves.toBeUndefined();
    });
  });

  describe("runExternalMigrations", () => {
    it("skips migrations when localStorage flags are already set", async () => {
      localStorage.setItem(DEMO_DATA_SEED_FLAG_KEY, "completed");

      const store = createMockOfflineDataStore();

      await runExternalMigrations(store);

      expect(store.putEvents).not.toHaveBeenCalled();
    });

    it("runs the demo-data seed and sets its flag when not previously completed", async () => {
      const store = createMockOfflineDataStore();

      await runExternalMigrations(store);

      expect(store.putEvents).toHaveBeenCalled();
      expect(localStorage.getItem(DEMO_DATA_SEED_FLAG_KEY)).toBe("completed");
    });
  });

  describe("runAllMigrations", () => {
    it("runs data then external migrations without error", async () => {
      const store = createMockOfflineDataStore();

      await expect(runAllMigrations(store)).resolves.toBeUndefined();
      expect(localStorage.getItem(DEMO_DATA_SEED_FLAG_KEY)).toBe("completed");
    });
  });
});
