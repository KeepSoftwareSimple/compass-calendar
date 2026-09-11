import { auditConnectionIdentity } from "@scripts/commands/audit-connection-identity/audit";
import { ObjectId } from "mongodb";
import {
  type PrincipalId,
  type ProviderAccountId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import mongoService from "@backend/common/services/mongo.service";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { ProviderConnectionRepository } from "@sync/storage/repositories/provider-connection.repository";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";

describe("auditConnectionIdentity provider filter (db)", () => {
  const syncStorage = setupSyncStorage(import.meta.url);
  let connections: ProviderConnectionRepository;

  beforeAll(() => setupTestDb(import.meta.url));
  afterEach(async () => {
    await cleanupCollections();
    await mongoService.user.deleteMany({});
  });
  afterAll(cleanupTestDb);

  const seedLoginUser = async (
    email: string,
    identities: {
      googleId?: string;
      microsoft?: { subjectId: string; email?: string };
    },
  ): Promise<string> => {
    const userId = new ObjectId();
    await mongoService.user.insertOne({
      _id: userId,
      email,
      name: email,
      firstName: email,
      lastName: "",
      locale: "not provided",
      ...(identities.googleId
        ? {
            google: {
              googleId: identities.googleId,
              picture: "",
              gRefreshToken: "refresh-token",
            },
          }
        : {}),
      ...(identities.microsoft
        ? {
            identities: [
              {
                provider: "microsoft",
                subjectId: identities.microsoft.subjectId,
                email: identities.microsoft.email ?? email,
                linkedAt: new Date("2026-01-01T00:00:00.000Z"),
              },
            ],
          }
        : {}),
    });
    return userId.toHexString();
  };

  const seedConnection = async (
    principalId: string,
    provider: "google" | "microsoft",
    providerAccountId: string,
    email: string,
  ) => {
    connections = new ProviderConnectionRepository(syncStorage.db());
    return connections.upsertByProviderAccount({
      tenantId: principalId as TenantId,
      principalId: principalId as PrincipalId,
      provider,
      account: {
        providerAccountId: providerAccountId as ProviderAccountId,
        email,
        displayName: null,
      },
      capabilities: ["readEvents", "readBusy", "writeEvents"],
      state: "healthy",
      stateReason: null,
    });
  };

  it("defaults to auditing every provider kind", async () => {
    const googleUser = await seedLoginUser("google@example.com", {
      googleId: "google-sub-1",
    });
    const microsoftUser = await seedLoginUser("microsoft@example.com", {
      microsoft: { subjectId: "ms-sub-1" },
    });
    await seedConnection(
      googleUser,
      "google",
      "google-sub-1",
      "google@example.com",
    );
    await seedConnection(
      microsoftUser,
      "microsoft",
      "ms-sub-1",
      "microsoft@example.com",
    );

    const report = await auditConnectionIdentity(
      mongoService.db,
      syncStorage.db(),
    );

    expect(report.providersAudited).toEqual(["google", "microsoft", "apple"]);
    expect(report.connectionsChecked).toBe(2);
    expect(report.collisions).toEqual([]);
  });

  it("selects only Microsoft connections when --provider microsoft is passed", async () => {
    const googleUser = await seedLoginUser("google@example.com", {
      googleId: "google-sub-1",
    });
    const microsoftUser = await seedLoginUser("microsoft@example.com", {
      microsoft: { subjectId: "ms-sub-1" },
    });
    const other = await seedLoginUser("other@example.com", {
      googleId: "google-sub-2",
    });
    await seedConnection(
      googleUser,
      "google",
      "google-sub-1",
      "google@example.com",
    );
    await seedConnection(
      microsoftUser,
      "microsoft",
      "ms-sub-1",
      "microsoft@example.com",
    );
    await seedConnection(
      other,
      "microsoft",
      "ms-sub-1",
      "microsoft@example.com",
    );

    const report = await auditConnectionIdentity(
      mongoService.db,
      syncStorage.db(),
      { provider: "microsoft" },
    );

    expect(report.providersAudited).toEqual(["microsoft"]);
    expect(report.connectionsChecked).toBe(2);
    expect(report.collisions).toEqual([
      {
        connectingUserId: other,
        connectionId: expect.any(String),
        provider: "microsoft",
        accountEmail: "microsoft@example.com",
        loginOwnerUserId: microsoftUser,
        loginOwnerEmail: "microsoft@example.com",
      },
    ]);
  });

  it("reports no collisions for a linked user with two login identities and both connections", async () => {
    const userId = new ObjectId();
    await mongoService.user.insertOne({
      _id: userId,
      email: "linked@example.com",
      name: "Linked User",
      firstName: "Linked",
      lastName: "User",
      locale: "not provided",
      google: {
        googleId: "google-sub-linked",
        picture: "",
        gRefreshToken: "refresh-token",
      },
      identities: [
        {
          provider: "google",
          subjectId: "google-sub-linked",
          email: "linked@example.com",
          linkedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          provider: "microsoft",
          subjectId: "ms-sub-linked",
          email: "linked@example.com",
          linkedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    });
    const principalId = userId.toHexString();
    await seedConnection(
      principalId,
      "google",
      "google-sub-linked",
      "linked@example.com",
    );
    await seedConnection(
      principalId,
      "microsoft",
      "ms-sub-linked",
      "linked@example.com",
    );

    const report = await auditConnectionIdentity(
      mongoService.db,
      syncStorage.db(),
    );

    expect(report.connectionsChecked).toBe(2);
    expect(report.collisions).toEqual([]);
  });
});
