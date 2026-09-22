import { type UserMetadata } from "@core/types/user.types";
import { UserDriver } from "@backend/__tests__/drivers/user.driver";
import { UserMetadataServiceDriver } from "@backend/__tests__/drivers/user-metadata.service.driver";
import { providerConnection } from "@backend/__tests__/factories/provider-connection.factory";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { restoreFileMocks } from "@backend/__tests__/helpers/mock.setup";
import { getUserMetadataStore } from "@backend/auth/ports/supertokens.registry";
import { initSupertokens } from "@backend/common/middleware/supertokens.middleware";
import * as syncServiceFactory from "@backend/common/services/sync-service/sync-service.factory";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
} from "bun:test";

describe("UserMetadataService", () => {
  const driver = new UserMetadataServiceDriver();

  beforeAll(initSupertokens);
  beforeAll(() => setupTestDb(import.meta.url));
  beforeEach(cleanupCollections);
  afterAll(cleanupTestDb);
  afterEach(() => {
    restoreFileMocks();
  });

  describe("updateUserMetadata", () => {
    it("merges metadata and returns the latest snapshot", async () => {
      const user = await UserDriver.createUser();
      const userId = user._id.toString();

      const metadata = await driver.updateUserMetadata({
        userId,
        data: { sync: { importGCal: "RESTART" } },
      });

      expect(metadata.sync?.importGCal).toBe("RESTART");

      const persisted = await driver.fetchUserMetadata(userId);

      expect(persisted.sync?.importGCal).toBe("RESTART");
    });

    it("ignores prototype-polluting keys in the update payload", async () => {
      const user = await UserDriver.createUser();
      const userId = user._id.toString();

      const data = JSON.parse(
        '{"sync":{"importGCal":"RESTART"},"__proto__":{"polluted":true}}',
      ) as Partial<UserMetadata>;

      const metadata = await driver.updateUserMetadata({ userId, data });

      expect(metadata.sync?.importGCal).toBe("RESTART");
      expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();

      const stored = await getUserMetadataStore().getUserMetadata(userId);

      expect(Object.getOwnPropertyNames(stored.metadata)).not.toContain(
        "__proto__",
      );
    });

    it("does not persist email subscription metadata from an update", async () => {
      const user = await UserDriver.createUser();
      const userId = user._id.toString();

      await driver.updateUserMetadata({
        userId,
        data: { subscribeToUpdates: true } as Partial<UserMetadata>,
      });

      const stored = await getUserMetadataStore().getUserMetadata(userId);

      expect(stored.metadata).not.toHaveProperty("subscribeToUpdates");
    });
  });

  describe("fetchUserMetadata", () => {
    it("retrieves stored metadata for the user", async () => {
      const user = await UserDriver.createUser();
      const userId = user._id.toString();

      await driver.updateUserMetadata({
        userId,
        data: { sync: { importGCal: "RESTART" } },
      });

      const metadata = await driver.fetchUserMetadata(userId);

      expect(metadata.sync?.importGCal).toBe("RESTART");
    });

    it("does not expose legacy email subscription metadata", async () => {
      const user = await UserDriver.createUser();
      const userId = user._id.toString();

      await getUserMetadataStore().updateUserMetadata(userId, {
        subscribeToUpdates: true,
      } as Partial<UserMetadata>);

      const metadata = await driver.fetchUserMetadata(userId);

      expect(metadata).not.toHaveProperty("subscribeToUpdates");
    });

    it("does not expose legacy email subscription metadata after an update", async () => {
      const user = await UserDriver.createUser();
      const userId = user._id.toString();

      await getUserMetadataStore().updateUserMetadata(userId, {
        subscribeToUpdates: true,
      } as Partial<UserMetadata>);

      const metadata = await driver.updateUserMetadata({
        userId,
        data: { sync: { importGCal: "RESTART" } },
      });

      expect(metadata).not.toHaveProperty("subscribeToUpdates");
      expect(metadata.sync?.importGCal).toBe("RESTART");
    });

    it("returns connections[] with provider on each summary", async () => {
      const user = await UserDriver.createUser();
      const userId = user._id.toString();
      const google = providerConnection("healthy");
      spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
        listConnections: async () => ({
          ok: true,
          value: { connections: [google] },
          correlationId: "corr-1",
        }),
      } as never);

      const metadata = await driver.fetchUserMetadata(userId);

      expect(metadata.connections).toEqual([
        expect.objectContaining({
          id: google.id,
          provider: "google",
          connectionState: "HEALTHY",
        }),
      ]);
    });

    // assessGoogleMetadata's local fallback (no Sync client configured) is
    // covered separately in user-metadata.service.no-sync-client.db.test.ts:
    // getSyncServiceClient() caches its result for the life of the process,
    // so once any test in this file calls fetchUserMetadata with the (now
    // always Sync-configured) shared test env, every later test in this
    // file is stuck with that cached real client - mockEnv can't undo it.
  });
});
