import {
  buildConnectionReport,
  formatConnectionReport,
} from "@scripts/commands/connection-report/report";
import { ObjectId } from "mongodb";
import { z } from "zod/v4";
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

const NOW = new Date("2026-09-21T12:00:00.000Z");

const JsonReportSchema = z.object({
  generatedAt: z.string(),
  activityAvailable: z.boolean(),
  rows: z.array(
    z.object({
      provider: z.string(),
      state: z.string(),
      stateReason: z.string().nullable(),
      count: z.number(),
      oldestUpdatedAt: z.string(),
      newestUpdatedAt: z.string(),
      activeLast30Days: z.number().nullable(),
      activeLast90Days: z.number().nullable(),
    }),
  ),
  staleImporting: z.array(
    z.object({
      id: z.string(),
      provider: z.string(),
      updatedAt: z.string(),
    }),
  ),
});

describe("connection-report (db)", () => {
  const syncStorage = setupSyncStorage(import.meta.url);
  let connections: ProviderConnectionRepository;

  beforeAll(() => setupTestDb(import.meta.url));
  afterEach(async () => {
    await cleanupCollections();
    await mongoService.user.deleteMany({});
  });
  afterAll(cleanupTestDb);

  const seedUser = async (lastSeenAt: Date | undefined): Promise<string> => {
    const userId = new ObjectId();
    await mongoService.user.insertOne({
      _id: userId,
      email: `${userId.toHexString()}@example.com`,
      name: "Report User",
      firstName: "Report",
      lastName: "User",
      locale: "not provided",
      ...(lastSeenAt ? { lastSeenAt } : {}),
    });
    return userId.toHexString();
  };

  const seedConnection = async (
    principalId: string,
    state: "healthy" | "importing" | "actionRequired",
    updatedAt: Date,
    providerAccountId: string,
  ) => {
    connections = new ProviderConnectionRepository(syncStorage.db());
    const row = await connections.upsertByProviderAccount({
      tenantId: principalId as TenantId,
      principalId: principalId as PrincipalId,
      provider: "google",
      account: {
        providerAccountId: providerAccountId as ProviderAccountId,
        email: "secret@example.com",
        displayName: null,
      },
      capabilities: ["readEvents", "readBusy", "writeEvents"],
      state,
      stateReason: state === "actionRequired" ? "authorizationRevoked" : null,
    });
    return connections.updateDerivedState(
      row.tenantId,
      row.principalId,
      row._id,
      {
        state: row.state,
        stateReason: row.stateReason,
        lastSyncedAt: row.lastSyncedAt,
        lastHealthyAt: row.lastHealthyAt,
      },
      updatedAt,
    );
  };

  it("groups three states, counts activity, and lists stale importing ids", async () => {
    const recent = await seedUser(new Date("2026-09-10T00:00:00.000Z"));
    const sixtyDays = await seedUser(new Date("2026-07-28T00:00:00.000Z"));
    const stale = await seedUser(undefined);

    await seedConnection(
      recent,
      "actionRequired",
      new Date("2026-08-01T00:00:00.000Z"),
      "acct-action-a",
    );
    await seedConnection(
      sixtyDays,
      "actionRequired",
      new Date("2026-09-01T00:00:00.000Z"),
      "acct-action-b",
    );
    await seedConnection(
      stale,
      "healthy",
      new Date("2026-09-20T00:00:00.000Z"),
      "acct-healthy",
    );
    const staleImport = await seedConnection(
      recent,
      "importing",
      new Date("2026-09-21T10:00:00.000Z"),
      "acct-import-stale",
    );
    await seedConnection(
      recent,
      "importing",
      new Date("2026-09-21T11:30:00.000Z"),
      "acct-import-fresh",
    );

    const report = await buildConnectionReport({
      syncDb: syncStorage.db(),
      usersDb: mongoService.db,
      now: NOW,
    });

    expect(report.activityAvailable).toBe(true);
    expect(report.rows).toEqual([
      {
        provider: "google",
        state: "actionRequired",
        stateReason: "authorizationRevoked",
        count: 2,
        oldestUpdatedAt: "2026-08-01T00:00:00.000Z",
        newestUpdatedAt: "2026-09-01T00:00:00.000Z",
        activeLast30Days: 1,
        activeLast90Days: 2,
      },
      {
        provider: "google",
        state: "healthy",
        stateReason: null,
        count: 1,
        oldestUpdatedAt: "2026-09-20T00:00:00.000Z",
        newestUpdatedAt: "2026-09-20T00:00:00.000Z",
        activeLast30Days: 0,
        activeLast90Days: 0,
      },
      {
        provider: "google",
        state: "importing",
        stateReason: null,
        count: 2,
        oldestUpdatedAt: "2026-09-21T10:00:00.000Z",
        newestUpdatedAt: "2026-09-21T11:30:00.000Z",
        activeLast30Days: 2,
        activeLast90Days: 2,
      },
    ]);
    expect(report.staleImporting).toEqual([
      {
        id: staleImport._id,
        provider: "google",
        updatedAt: "2026-09-21T10:00:00.000Z",
      },
    ]);

    const json = formatConnectionReport(report, true);
    expect(json).not.toContain("secret@example.com");
    expect(JsonReportSchema.parse(JSON.parse(json)).rows).toHaveLength(3);

    const text = formatConnectionReport(report, false);
    expect(text).toContain("actionRequired");
    expect(text).toContain(staleImport._id);
    expect(text).not.toContain("secret@example.com");
  });

  it("prints activity unavailable when the API database is not readable", async () => {
    const principalId = await seedUser(new Date("2026-09-10T00:00:00.000Z"));
    await seedConnection(
      principalId,
      "healthy",
      new Date("2026-09-20T00:00:00.000Z"),
      "acct-healthy",
    );

    const report = await buildConnectionReport({
      syncDb: syncStorage.db(),
      usersDb: null,
      now: NOW,
    });

    expect(report.activityAvailable).toBe(false);
    expect(report.rows).toEqual([
      {
        provider: "google",
        state: "healthy",
        stateReason: null,
        count: 1,
        oldestUpdatedAt: "2026-09-20T00:00:00.000Z",
        newestUpdatedAt: "2026-09-20T00:00:00.000Z",
        activeLast30Days: null,
        activeLast90Days: null,
      },
    ]);
    expect(formatConnectionReport(report, false)).toContain(
      "activity unavailable",
    );
  });
});
