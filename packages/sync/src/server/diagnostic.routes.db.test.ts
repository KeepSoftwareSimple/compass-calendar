import { faker } from "@faker-js/faker";
import { NodeEnv } from "@core/constants/core.constants";
import { type DiagnosticConnectionResponse } from "@core/types/sync/diagnostic.contracts";
import {
  type PrincipalId,
  type ProviderAccountId,
  type ProviderCalendarSourceId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { defaultCalendarListFields } from "@sync/__tests__/helpers/fixtures";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { createSyncService, type SyncService } from "@sync/app";
import { signInternalRequest } from "@sync/auth/internal-auth";
import { type SyncConfig } from "@sync/config/sync.config";
import { deriveDiagnosticKey } from "@sync/safety/diagnostic-key";
import { DIAGNOSTIC_CONNECTION_PATH } from "@sync/server/diagnostic.routes";
import { ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { ProviderConnectionRepository } from "@sync/storage/repositories/provider-connection.repository";
import { type SyncMongoService } from "@sync/storage/sync-mongo.service";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { type AddressInfo } from "node:net";

const uri = process.env["SYNC_MONGO_URI"] as string;
const storage = setupSyncStorage(import.meta.url);
const objectId = () => faker.database.mongodbObjectId();
const SECRET = "internal-secret";

const testConfig = (): SyncConfig =>
  ({
    NODE_ENV: NodeEnv.Test,
    PORT: 0,
    MONGO_URI: uri,
    INTERNAL_AUTH_TOKEN: SECRET,
    CALLBACK_BASE_URL: "http://localhost:3010",
    EXECUTION: "passive",
    MAX_CONCURRENCY: 4,
  }) as SyncConfig;

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

describe("GET /internal/diagnostics/connections/:diagnosticKey", () => {
  let mongo: SyncMongoService;
  let service: SyncService;
  let base: string;

  beforeEach(async () => {
    mongo = storage.mongo();
    service = createSyncService(testConfig(), { mongo });
    await new Promise<void>((resolve) => service.httpServer.listen(0, resolve));
    const { port } = service.httpServer.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await service?.stop();
  });

  it("resolves a diagnostic key to metadata without event content", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const connections = new ProviderConnectionRepository(mongo.db);
    const calendars = new ProviderCalendarRepository(mongo.db);

    const connection = await connections.upsertByProviderAccount({
      tenantId: tenantId,
      principalId: principalId,
      provider: "google",
      account: {
        providerAccountId: objectId() as ProviderAccountId,
        email: "support-lookup@example.com",
        displayName: null,
      },
      capabilities: ["readEvents"],
      state: "delayed",
      stateReason: null,
    });
    await calendars.upsertByProviderCalendar({
      tenantId: tenantId,
      principalId: principalId,
      connectionId: connection._id,
      providerCalendarId: "primary" as ProviderCalendarSourceId,
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

    expect(connection.diagnosticKey).toBe(deriveDiagnosticKey(connection._id));

    const path = DIAGNOSTIC_CONNECTION_PATH.replace(
      ":diagnosticKey",
      connection.diagnosticKey,
    );
    const response = await fetch(`${base}${path}`, {
      headers: signedHeaders(objectId(), objectId()),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as DiagnosticConnectionResponse;
    expect(body.connectionId).toBe(connection._id);
    expect(body.tenantId).toBe(tenantId);
    expect(body.principalId).toBe(principalId);
    expect(body.accountEmail).toBe("support-lookup@example.com");
    expect(body.state).toBe("delayed");
    expect(body.calendarCount).toBe(1);
    expect(body).not.toHaveProperty("refreshToken");
    expect(body).not.toHaveProperty("title");
  });

  it("returns 404 for an unknown diagnostic key", async () => {
    const path = DIAGNOSTIC_CONNECTION_PATH.replace(
      ":diagnosticKey",
      "a".repeat(32),
    );
    const response = await fetch(`${base}${path}`, {
      headers: signedHeaders(objectId(), objectId()),
    });
    expect(response.status).toBe(404);
  });
});
