import { faker } from "@faker-js/faker";
import { NodeEnv } from "@core/constants/core.constants";
import {
  type ConnectionId,
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { type PrincipalPurgeResponse } from "@core/types/sync/principal.contracts";
import {
  seedOauthCredential,
  TEST_CREDENTIAL_ENCRYPTION_KEY,
} from "@sync/__tests__/helpers/credential-encryption";
import { defaultCalendarListFields } from "@sync/__tests__/helpers/fixtures";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { createSyncService, type SyncService } from "@sync/app";
import { signInternalRequest } from "@sync/auth/internal-auth";
import { type SyncConfig } from "@sync/config/sync.config";
import {
  type ProviderAuthAdapter,
  type ProviderAuthorization,
  type RefreshedCredential,
} from "@sync/providers/provider-auth.port";
import { PRINCIPAL_PATH } from "@sync/server/principal.routes";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { CredentialRepository } from "@sync/storage/repositories/credential.repository";
import { InvalidationRepository } from "@sync/storage/repositories/invalidation.repository";
import { JobRepository } from "@sync/storage/repositories/job.repository";
import { ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { ProviderConnectionRepository } from "@sync/storage/repositories/provider-connection.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";
import { type SyncMongoService } from "@sync/storage/sync-mongo.service";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { type AddressInfo } from "node:net";

const uri = process.env["SYNC_MONGO_URI"] as string;
const storage = setupSyncStorage(import.meta.url);
const objectId = () => faker.database.mongodbObjectId();
const SECRET = "internal-secret";

const testConfig = (overrides: Partial<SyncConfig> = {}): SyncConfig =>
  ({
    NODE_ENV: NodeEnv.Test,
    PORT: 0,
    MONGO_URI: uri,
    INTERNAL_AUTH_TOKEN: SECRET,
    CALLBACK_BASE_URL: "http://localhost:3010",
    EXECUTION: "passive",
    MAX_CONCURRENCY: 4,
    CREDENTIAL_ENCRYPTION_KEY: TEST_CREDENTIAL_ENCRYPTION_KEY,
    ...overrides,
  }) as SyncConfig;

class FakeAuthAdapter implements ProviderAuthAdapter {
  revoked: string[] = [];
  buildAuthorizationUrl(): string {
    throw new Error("unused");
  }
  exchangeAuthorizationCode(): Promise<ProviderAuthorization> {
    throw new Error("unused");
  }
  refreshAccessToken(): Promise<RefreshedCredential> {
    throw new Error("unused");
  }
  async revoke(input: { token: string }): Promise<void> {
    this.revoked.push(input.token);
  }
}

const signedHeaders = (
  tenantId: string,
  principalId: string,
): Record<string, string> => {
  const timestamp = Date.now();
  return {
    "x-sync-tenant": tenantId,
    "x-sync-principal": principalId,
    "x-sync-timestamp": String(timestamp),
    "x-sync-signature": signInternalRequest(SECRET, {
      timestamp,
      tenantId,
      principalId,
    }),
  };
};

const seedConnection = (
  repo: ProviderConnectionRepository,
  tenantId: string,
  principalId: string,
) =>
  repo.upsertByProviderAccount({
    tenantId: tenantId as TenantId,
    principalId: principalId as PrincipalId,
    provider: "google",
    account: {
      providerAccountId: objectId(),
      email: "purge@example.com",
      displayName: null,
    },
    capabilities: ["readEvents"],
    state: "healthy",
    stateReason: null,
  });

describe("DELETE /internal/principal", () => {
  let mongo: SyncMongoService;
  let service: SyncService;
  let base: string;
  let adapter: FakeAuthAdapter;

  const startService = async (options?: {
    config?: SyncConfig;
    // Omit to use the FakeAuthAdapter; pass null to exercise local-only purge.
    authAdapter?: ProviderAuthAdapter | null;
  }) => {
    const authAdapter =
      options && "authAdapter" in options ? options.authAdapter : adapter;
    service = createSyncService(options?.config ?? testConfig(), {
      mongo,
      authAdapter: authAdapter ?? undefined,
    });
    await new Promise<void>((resolve) => service.httpServer.listen(0, resolve));
    const { port } = service.httpServer.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  };

  beforeEach(() => {
    mongo = storage.mongo();
    adapter = new FakeAuthAdapter();
  });

  afterEach(async () => {
    await service?.stop();
  });

  it("revokes credentials and hard-deletes every principal-scoped row", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    const stranger = objectId();

    const connections = new ProviderConnectionRepository(mongo.db);
    const credentials = new CredentialRepository(mongo.db);
    const calendars = new ProviderCalendarRepository(mongo.db);
    const resources = new SyncResourceRepository(mongo.db);
    const jobs = new JobRepository(mongo.db);
    const invalidations = new InvalidationRepository(mongo.db);

    const mine = await seedConnection(connections, tenantId, principalId);
    const theirs = await seedConnection(connections, tenantId, stranger);
    await seedOauthCredential(credentials, {
      connectionId: mine._id,
      provider: "google",
      refreshToken: "mine-refresh",
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });
    await seedOauthCredential(credentials, {
      connectionId: theirs._id,
      provider: "google",
      refreshToken: "theirs-refresh",
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });
    await calendars.upsertByProviderCalendar({
      tenantId: tenantId as TenantId,
      principalId: principalId as PrincipalId,
      connectionId: mine._id,
      providerCalendarId: "primary",
      displayName: "Primary",
      color: null,
      ...defaultCalendarListFields,
      active: true,
      primary: true,
      accessRole: "owner",
      capabilities: {
        canReadBusy: true,
        canReadEvents: true,
        canWriteEvents: true,
        canInviteAttendees: false,
      },
    });
    await resources.ensure({
      tenantId: tenantId as TenantId,
      principalId: principalId as PrincipalId,
      connectionId: mine._id,
      resourceKind: "calendarList",
      calendarId: null,
    });
    await jobs.enqueue({
      tenantId: tenantId as TenantId,
      principalId: principalId as PrincipalId,
      connectionId: mine._id,
      resourceId: null,
      commandId: null,
      kind: "calendarListSync",
      priority: 0,
      runAfter: new Date(),
      coalescingKey: `purge-test:${mine._id}`,
    });
    await invalidations.append({
      tenantId: tenantId as TenantId,
      principalId: principalId as PrincipalId,
      invalidation: { kind: "connection", connectionId: mine._id },
      emittedAt: new Date(),
    });

    await startService();

    const res = await fetch(`${base}${PRINCIPAL_PATH}`, {
      method: "DELETE",
      headers: signedHeaders(tenantId, principalId),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as PrincipalPurgeResponse;
    expect(body.connections).toBe(1);
    expect(body.credentials).toBe(1);
    expect(body.calendars).toBe(1);
    expect(body.syncResources).toBe(1);
    expect(body.jobs).toBe(1);
    expect(body.invalidations).toBe(1);

    expect(adapter.revoked).toEqual(["mine-refresh"]);
    expect(
      await connections.listByPrincipal(
        tenantId as TenantId,
        principalId as PrincipalId,
      ),
    ).toHaveLength(0);
    expect(await credentials.findByConnection(mine._id)).toBeNull();
    expect(await credentials.findByConnection(theirs._id)).not.toBeNull();
    expect(
      await connections.listByPrincipal(
        tenantId as TenantId,
        stranger as PrincipalId,
      ),
    ).toHaveLength(1);
  });

  it("is idempotent and works in passive mode without an auth adapter", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    const connections = new ProviderConnectionRepository(mongo.db);
    const credentials = new CredentialRepository(mongo.db);
    const connection = await seedConnection(connections, tenantId, principalId);
    await seedOauthCredential(credentials, {
      connectionId: connection._id as ConnectionId,
      provider: "google",
      refreshToken: "local-only",
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });

    await startService({
      config: testConfig({ EXECUTION: "passive" }),
      authAdapter: null,
    });

    const first = await fetch(`${base}${PRINCIPAL_PATH}`, {
      method: "DELETE",
      headers: signedHeaders(tenantId, principalId),
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as PrincipalPurgeResponse;
    expect(firstBody.connections).toBe(1);
    expect(firstBody.credentials).toBe(1);
    expect(adapter.revoked).toEqual([]);

    const second = await fetch(`${base}${PRINCIPAL_PATH}`, {
      method: "DELETE",
      headers: signedHeaders(tenantId, principalId),
    });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as PrincipalPurgeResponse;
    expect(secondBody).toEqual({
      connections: 0,
      credentials: 0,
      calendars: 0,
      events: 0,
      eventOccurrences: 0,
      syncResources: 0,
      commands: 0,
      jobs: 0,
      deletionMarkers: 0,
      invalidations: 0,
    });
    expect(
      await mongo.db
        .collection(SYNC_COLLECTIONS.providerConnections)
        .countDocuments({
          tenantId,
          principalId,
        }),
    ).toBe(0);
  });

  it("rejects an unsigned purge", async () => {
    await startService();
    const res = await fetch(`${base}${PRINCIPAL_PATH}`, { method: "DELETE" });
    expect(res.status).toBe(401);
  });
});
