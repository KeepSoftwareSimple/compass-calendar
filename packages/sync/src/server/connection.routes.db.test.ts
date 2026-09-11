import { faker } from "@faker-js/faker";
import { NodeEnv } from "@core/constants/core.constants";
import { MICROSOFT_SCOPES } from "@core/providers/microsoft.scopes";
import { decryptCredentialAtRest } from "@core/security/credential-at-rest";
import {
  encryptAdoptAuthorizationCredential,
  encryptCredentialConnectPayload,
  encryptInternalCredential,
} from "@core/security/internal-credential-envelope";
import {
  type ConnectionId,
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import dayjs from "@core/util/date/dayjs";
import {
  seedOauthCredential,
  TEST_CREDENTIAL_ENCRYPTION_KEY,
} from "@sync/__tests__/helpers/credential-encryption";
import {
  ensureEventsResource,
  seedProviderCalendar,
} from "@sync/__tests__/helpers/fixtures";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { createSyncService, type SyncService } from "@sync/app";
import {
  signInternalRequest,
  signServiceRequest,
} from "@sync/auth/internal-auth";
import { type SyncConfig } from "@sync/config/sync.config";
import { openOauthRefreshToken } from "@sync/credentials/oauth-refresh-at-rest";
import {
  deriveOAuthStateSecret,
  signOAuthState,
  verifyOAuthState,
} from "@sync/oauth/oauth-state";
import {
  type CredentialValidationInput,
  type PasswordCredentialAuthAdapter,
} from "@sync/providers/apple/apple-auth.adapter";
import { APPLE_PROVIDER_CAPABILITIES } from "@sync/providers/apple/apple-capabilities";
import {
  type ProviderAuthAdapter,
  ProviderAuthError,
  type ProviderAuthorization,
  type RefreshedCredential,
} from "@sync/providers/provider-auth.port";
import {
  buildProviderRegistry,
  ProviderRegistry,
} from "@sync/providers/provider-registry";
import { COMMANDS_PATH } from "@sync/server/command.routes";
import {
  ADOPT_AUTHORIZATION_PATH,
  ADOPT_GOOGLE_AUTHORIZATION_PATH,
  BEGIN_PATH,
  CALENDARS_PATH,
  CONNECTIONS_PATH,
  CREDENTIAL_PATH,
  EVENTS_FULL_PATH,
  FOREGROUND_REFRESH_PATH,
  OAUTH_CALLBACK_PATH,
  REFRESH_PATH,
} from "@sync/server/connection.routes";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import {
  type EventRecord,
  EventRecordSchema,
} from "@sync/storage/contracts/event.contracts";
import {
  type EventOccurrenceRecord,
  EventOccurrenceRecordSchema,
} from "@sync/storage/contracts/event-occurrence.contracts";
import { JOB_PRIORITY } from "@sync/storage/contracts/job.contracts";
import { CredentialRepository } from "@sync/storage/repositories/credential.repository";
import { JobRepository } from "@sync/storage/repositories/job.repository";
import { ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { ProviderConnectionRepository } from "@sync/storage/repositories/provider-connection.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";
import { type SyncMongoService } from "@sync/storage/sync-mongo.service";
import { readFileSync, statSync } from "node:fs";
import { type AddressInfo } from "node:net";

const uri = process.env["SYNC_MONGO_URI"] as string;
const storage = setupSyncStorage(import.meta.url);
const objectId = () => faker.database.mongodbObjectId();
const SECRET = "internal-secret";
// The service signs OAuth state with a key derived from the root secret.
const STATE_SECRET = deriveOAuthStateSecret(SECRET);

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

// A minimal provider auth adapter: disconnect exercises revoke and begin
// exercises buildAuthorizationUrl; both record their inputs instead of hitting
// the network.
class FakeAuthAdapter implements ProviderAuthAdapter {
  revoked: string[] = [];
  authorizations: Array<{
    state: string;
    redirectUri: string;
    selectAccount?: boolean;
    loginHint?: string;
    extraScopes?: readonly string[];
  }> = [];
  buildAuthorizationUrl(input: {
    state: string;
    redirectUri: string;
    selectAccount?: boolean;
    loginHint?: string;
    extraScopes?: readonly string[];
  }): string {
    this.authorizations.push(input);
    return `https://consent.example.com/?state=${input.state}`;
  }
  exchanges: Array<{ code: string; redirectUri: string }> = [];
  exchangeResult: ProviderAuthorization = {
    account: {
      providerAccountId: "google-sub-1",
      email: "connected@example.com",
      displayName: "Connected User",
    },
    refreshToken: "granted-refresh-token",
    grantedScopes: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ],
  };
  exchangeError?: unknown;
  async exchangeAuthorizationCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<ProviderAuthorization> {
    this.exchanges.push(input);
    if (this.exchangeError) throw this.exchangeError;
    return this.exchangeResult;
  }
  refreshAccessToken(): Promise<RefreshedCredential> {
    throw new Error("unused");
  }
  async revoke(input: { token: string }): Promise<void> {
    this.revoked.push(input.token);
  }
}

class FakeAppleAuthAdapter implements PasswordCredentialAuthAdapter {
  validateCalls: CredentialValidationInput[] = [];
  validateError?: unknown;

  buildAuthorizationUrl(): string {
    throw new Error("unused");
  }
  exchangeAuthorizationCode(): Promise<never> {
    throw new Error("unused");
  }
  refreshAccessToken(): Promise<RefreshedCredential> {
    throw new Error("unused");
  }
  async revoke(): Promise<void> {}
  async validateCredential(input: CredentialValidationInput): Promise<void> {
    this.validateCalls.push(input);
    if (this.validateError) throw this.validateError;
  }
}

const registryWithApple = (authAdapter: PasswordCredentialAuthAdapter) => {
  const config = testConfig({ EXECUTION: "active" });
  const google = buildProviderRegistry(config, {
    google: { auth: new FakeAuthAdapter() },
  }).get("google");
  return new ProviderRegistry(
    new Map([
      [
        "apple",
        {
          ...google,
          adapters: {
            ...google.adapters,
            auth: authAdapter,
          },
          capabilities: APPLE_PROVIDER_CAPABILITIES,
          capabilitiesFromScopes: () => [...APPLE_PROVIDER_CAPABILITIES],
          callbackPath: "/sync/apple",
          notificationsCallbackPath: "/sync/notifications/apple",
        },
      ],
    ]),
  );
};

const seedConnection = (
  repo: ProviderConnectionRepository,
  tenantId: string,
  principalId: string,
  email: string,
) =>
  repo.upsertByProviderAccount({
    tenantId: tenantId as TenantId,
    principalId: principalId as PrincipalId,
    provider: "google",
    account: {
      providerAccountId: objectId(),
      email,
      displayName: null,
    },
    capabilities: ["readEvents"],
    state: "healthy",
    stateReason: null,
  });

// Sign like the trusted Compass API would, so the request clears internal auth.
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

const serviceSignedHeaders = (): Record<string, string> => {
  const timestamp = Date.now();
  return {
    "content-type": "application/json",
    "x-sync-timestamp": String(timestamp),
    "x-sync-signature": signServiceRequest(SECRET, timestamp),
  };
};

describe("GET /internal/connections", () => {
  let mongo: SyncMongoService;
  let repo: ProviderConnectionRepository;
  let credentials: CredentialRepository;
  let resources: SyncResourceRepository;
  let service: SyncService;
  let base: string;

  const startService = async (
    config: SyncConfig = testConfig(),
    authAdapter?: ProviderAuthAdapter,
  ) => {
    service = createSyncService(config, { mongo, authAdapter });
    await new Promise<void>((resolve) => service.httpServer.listen(0, resolve));
    const { port } = service.httpServer.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  };

  // List refreshes stored state from live evidence. Healthy requires a valid
  // credential and a finished calendar-list discovery (no active calendars is
  // enough for the import settle check).
  const seedHealthyConnection = async (
    tenantId: string,
    principalId: string,
    email: string,
  ) => {
    const connection = await seedConnection(repo, tenantId, principalId, email);
    await seedOauthCredential(credentials, {
      connectionId: connection._id,
      provider: "google",
      refreshToken: "stored-refresh-token",
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });
    const listResource = await resources.ensure({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      resourceKind: "calendarList",
      calendarId: null,
    });
    await resources.advanceCursor(
      connection.tenantId,
      connection.principalId,
      listResource._id,
      "list-cursor",
      new Date(),
    );
    return connection;
  };

  beforeEach(() => {
    mongo = storage.mongo();
    repo = new ProviderConnectionRepository(mongo.db);
    credentials = new CredentialRepository(mongo.db);
    resources = new SyncResourceRepository(mongo.db);
  });

  afterEach(async () => {
    await service?.stop();
  });

  it("returns the caller's connections mapped to the wire contract", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await seedHealthyConnection(tenantId, principalId, "me@example.com");
    await startService();

    const res = await fetch(`${base}${CONNECTIONS_PATH}`, {
      headers: signedHeaders(tenantId, principalId),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      connections: Array<Record<string, unknown>>;
    };
    expect(body.connections).toHaveLength(1);
    expect(body.connections[0]).toMatchObject({
      principalId,
      provider: "google",
      state: "healthy",
      account: { email: "me@example.com", displayName: null },
    });
    // Timestamps are ISO strings on the wire, not Dates.
    expect(typeof body.connections[0].createdAt).toBe("string");
  });

  it("scopes results to the authenticated principal", async () => {
    const tenantId = objectId();
    const mine = objectId();
    const other = objectId();
    await seedConnection(repo, tenantId, mine, "mine@example.com");
    await seedConnection(repo, tenantId, other, "other@example.com");
    await startService();

    const res = await fetch(`${base}${CONNECTIONS_PATH}`, {
      headers: signedHeaders(tenantId, mine),
    });

    const body = (await res.json()) as {
      connections: Array<{ account: { email: string } }>;
    };
    expect(body.connections).toHaveLength(1);
    expect(body.connections[0].account.email).toBe("mine@example.com");
  });

  it("returns an empty list for a principal with no connections", async () => {
    await startService();

    const res = await fetch(`${base}${CONNECTIONS_PATH}`, {
      headers: signedHeaders(objectId(), objectId()),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ connections: [] });
  });

  it("rejects a request that is not signed", async () => {
    await startService();

    const res = await fetch(`${base}${CONNECTIONS_PATH}`);

    expect(res.status).toBe(401);
  });

  it("rejects a request whose signature does not match", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await startService();

    const headers = signedHeaders(tenantId, principalId);
    headers["x-sync-signature"] = "deadbeef";

    const res = await fetch(`${base}${CONNECTIONS_PATH}`, { headers });

    expect(res.status).toBe(401);
  });

  it("serves reads in passive mode (they touch no provider)", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await seedConnection(repo, tenantId, principalId, "passive@example.com");
    await startService(testConfig({ EXECUTION: "passive" }));

    const res = await fetch(`${base}${CONNECTIONS_PATH}`, {
      headers: signedHeaders(tenantId, principalId),
    });

    expect(res.status).toBe(200);
    expect(
      ((await res.json()) as { connections: unknown[] }).connections,
    ).toHaveLength(1);
  });
});

describe("DELETE /internal/connections/:id", () => {
  let mongo: SyncMongoService;
  let connections: ProviderConnectionRepository;
  let credentials: CredentialRepository;
  let service: SyncService;
  let base: string;
  let adapter: FakeAuthAdapter;

  const activeConfig = () => testConfig({ EXECUTION: "active" });

  const startService = async (
    config: SyncConfig,
    authAdapter?: ProviderAuthAdapter,
  ) => {
    service = createSyncService(config, { mongo, authAdapter });
    await new Promise<void>((resolve) => service.httpServer.listen(0, resolve));
    const { port } = service.httpServer.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  };

  beforeEach(() => {
    mongo = storage.mongo();
    connections = new ProviderConnectionRepository(mongo.db);
    credentials = new CredentialRepository(mongo.db);
    adapter = new FakeAuthAdapter();
  });

  afterEach(async () => {
    await service?.stop();
  });

  const seedConnected = async (tenantId: string, principalId: string) => {
    const connection = await seedConnection(
      connections,
      tenantId,
      principalId,
      "connected@example.com",
    );
    await seedOauthCredential(credentials, {
      connectionId: connection._id,
      provider: "google",
      refreshToken: "stored-refresh-token",
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });
    return connection._id;
  };

  it("revokes, deletes the credential, and marks the connection disconnected", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    const id = await seedConnected(tenantId, principalId);
    await startService(activeConfig(), adapter);

    const res = await fetch(`${base}${CONNECTIONS_PATH}/${id}`, {
      method: "DELETE",
      headers: signedHeaders(tenantId, principalId),
    });

    expect(res.status).toBe(204);
    expect(adapter.revoked).toEqual(["stored-refresh-token"]);
    expect(await credentials.findByConnection(id)).toBeNull();
    const after = await connections.findById(
      tenantId as never,
      principalId as never,
      id,
    );
    expect(after?.state).toBe("disconnected");
    expect(after?.disconnectedAt).toBeInstanceOf(Date);
  });

  it("refuses to disconnect in passive mode rather than half-disconnecting", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    const id = await seedConnected(tenantId, principalId);
    await startService(testConfig({ EXECUTION: "passive" }), adapter);

    const res = await fetch(`${base}${CONNECTIONS_PATH}/${id}`, {
      method: "DELETE",
      headers: signedHeaders(tenantId, principalId),
    });

    expect(res.status).toBe(409);
    // Nothing was revoked or deleted.
    expect(adapter.revoked).toEqual([]);
    expect(await credentials.findByConnection(id)).not.toBeNull();
  });

  it("returns 404 for a connection the principal does not own, revoking nothing", async () => {
    const tenantId = objectId();
    const owner = objectId();
    const stranger = objectId();
    const id = await seedConnected(tenantId, owner);
    await startService(activeConfig(), adapter);

    const res = await fetch(`${base}${CONNECTIONS_PATH}/${id}`, {
      method: "DELETE",
      headers: signedHeaders(tenantId, stranger),
    });

    expect(res.status).toBe(404);
    expect(adapter.revoked).toEqual([]);
    expect(await credentials.findByConnection(id)).not.toBeNull();
  });

  it("rejects a malformed connection id", async () => {
    await startService(activeConfig(), adapter);

    const res = await fetch(`${base}${CONNECTIONS_PATH}/not-an-object-id`, {
      method: "DELETE",
      headers: signedHeaders(objectId(), objectId()),
    });

    expect(res.status).toBe(400);
  });

  it("rejects an unsigned disconnect", async () => {
    await startService(activeConfig(), adapter);

    const res = await fetch(
      `${base}${CONNECTIONS_PATH}/${objectId() as ConnectionId}`,
      { method: "DELETE" },
    );

    expect(res.status).toBe(401);
  });
});

describe("POST /internal/connections/begin", () => {
  let mongo: SyncMongoService;
  let connections: ProviderConnectionRepository;
  let service: SyncService;
  let base: string;
  let adapter: FakeAuthAdapter;

  const activeConfig = () => testConfig({ EXECUTION: "active" });

  const startService = async (
    config: SyncConfig,
    authAdapter?: ProviderAuthAdapter,
  ) => {
    service = createSyncService(config, { mongo, authAdapter });
    await new Promise<void>((resolve) => service.httpServer.listen(0, resolve));
    const { port } = service.httpServer.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  };

  const begin = (
    tenantId: string,
    principalId: string,
    body?: Record<string, unknown>,
  ) =>
    fetch(`${base}${BEGIN_PATH}`, {
      method: "POST",
      headers: {
        ...signedHeaders(tenantId, principalId),
        "content-type": "application/json",
      },
      body: JSON.stringify(body ?? {}),
    });

  beforeEach(() => {
    mongo = storage.mongo();
    connections = new ProviderConnectionRepository(mongo.db);
    adapter = new FakeAuthAdapter();
  });

  afterEach(async () => {
    await service?.stop();
  });

  it("returns a consent url whose state binds the flow to the caller", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await startService(activeConfig(), adapter);

    const res = await begin(tenantId, principalId);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { authorizationUrl: string };
    const { state, redirectUri } = adapter.authorizations[0];
    expect(body.authorizationUrl).toContain(state);
    expect(redirectUri).toBe(`http://localhost:3010${OAUTH_CALLBACK_PATH}`);

    const verified = verifyOAuthState(STATE_SECRET, state, Date.now());
    expect(verified.ok && verified.payload.principalId).toBe(principalId);
    expect(verified.ok && verified.payload.tenantId).toBe(tenantId);
    expect(verified.ok && verified.payload.connectionId).toBeNull();
  });

  it("does not force the account chooser for a principal's first connection", async () => {
    await startService(activeConfig(), adapter);

    await begin(objectId(), objectId());

    // Nothing to choose between yet, and the chooser is an extra click.
    expect(adapter.authorizations[0].selectAccount).toBe(false);
  });

  it("forces the account chooser when the principal already has a connection", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await seedConnection(
      connections,
      tenantId,
      principalId,
      "first@example.com",
    );
    await startService(activeConfig(), adapter);

    await begin(tenantId, principalId);

    // Otherwise Google re-authorizes the connected account and nothing
    // appears to happen.
    expect(adapter.authorizations[0].selectAccount).toBe(true);
  });

  it("never forces the account chooser on reconnect (it is account-pinned)", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    const existing = await seedConnection(
      connections,
      tenantId,
      principalId,
      "reconnect@example.com",
    );
    await startService(activeConfig(), adapter);

    await begin(tenantId, principalId, { connectionId: existing._id });

    expect(adapter.authorizations[0].selectAccount).toBe(false);
    expect(adapter.authorizations[0].loginHint).toBe("reconnect@example.com");
  });

  it("binds the state to an owned connection for reconnect", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    const existing = await seedConnection(
      connections,
      tenantId,
      principalId,
      "reconnect@example.com",
    );
    await startService(activeConfig(), adapter);

    const res = await begin(tenantId, principalId, {
      connectionId: existing._id,
    });

    expect(res.status).toBe(200);
    const { state } = adapter.authorizations[0];
    const verified = verifyOAuthState(STATE_SECRET, state, Date.now());
    expect(verified.ok && verified.payload.connectionId).toBe(existing._id);
  });

  it("refuses to reconnect a connection the principal does not own", async () => {
    const tenantId = objectId();
    const owner = objectId();
    const stranger = objectId();
    const existing = await seedConnection(
      connections,
      tenantId,
      owner,
      "owner@example.com",
    );
    await startService(activeConfig(), adapter);

    const res = await begin(tenantId, stranger, {
      connectionId: existing._id,
    });

    expect(res.status).toBe(404);
    expect(adapter.authorizations).toHaveLength(0);
  });

  it("rejects a malformed reconnect connection id", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await startService(activeConfig(), adapter);

    const res = await begin(tenantId, principalId, { connectionId: "nope" });

    expect(res.status).toBe(400);
  });

  it("asks for both contacts scopes when begin carries the contacts feature", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await startService(activeConfig(), adapter);

    const res = await begin(tenantId, principalId, {
      features: ["contacts"],
    });

    expect(res.status).toBe(200);
    expect(adapter.authorizations[0].extraScopes).toEqual([
      "https://www.googleapis.com/auth/contacts.readonly",
      "https://www.googleapis.com/auth/contacts.other.readonly",
    ]);
  });

  it("keeps a plain begin's adapter input identical to before features existed", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await startService(activeConfig(), adapter);

    // No features field, and an explicitly empty one — both must produce the
    // pre-WP-05 adapter input: no extraScopes key at all, so the consent URL
    // is byte-identical to a plain connect.
    await begin(tenantId, principalId);
    await begin(tenantId, principalId, { features: [] });

    for (const authorization of adapter.authorizations) {
      expect("extraScopes" in authorization).toBe(false);
    }
  });

  it("rejects an unknown feature", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await startService(activeConfig(), adapter);

    const res = await begin(tenantId, principalId, {
      features: ["telepathy"],
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_features" });
    expect(adapter.authorizations).toHaveLength(0);
  });

  it("refuses to begin in passive mode", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await startService(testConfig({ EXECUTION: "passive" }), adapter);

    const res = await begin(tenantId, principalId);

    expect(res.status).toBe(409);
    expect(adapter.authorizations).toHaveLength(0);
  });

  it("rejects an unsigned begin", async () => {
    await startService(activeConfig(), adapter);

    const res = await fetch(`${base}${BEGIN_PATH}`, { method: "POST" });

    expect(res.status).toBe(401);
  });
});

describe("GET /sync/google", () => {
  let mongo: SyncMongoService;
  let connections: ProviderConnectionRepository;
  let credentials: CredentialRepository;
  let service: SyncService;
  let base: string;
  let adapter: FakeAuthAdapter;

  const activeConfig = () => testConfig({ EXECUTION: "active" });

  const startService = async (
    config: SyncConfig,
    authAdapter?: ProviderAuthAdapter,
    registry?: ProviderRegistry,
  ) => {
    service = createSyncService(config, { mongo, authAdapter, registry });
    await new Promise<void>((resolve) => service.httpServer.listen(0, resolve));
    const { port } = service.httpServer.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  };

  const validState = (tenantId: string, principalId: string) =>
    signOAuthState(deriveOAuthStateSecret(SECRET), {
      tenantId: tenantId as TenantId,
      principalId: principalId as PrincipalId,
      connectionId: null,
      provider: "google",
      issuedAt: Date.now(),
    });

  const hitCallback = (query: string) =>
    fetch(`${base}${OAUTH_CALLBACK_PATH}?${query}`, { redirect: "manual" });

  const statusOf = (res: Response) =>
    new URL(res.headers.get("location") as string).searchParams.get("status");

  beforeEach(() => {
    mongo = storage.mongo();
    connections = new ProviderConnectionRepository(mongo.db);
    credentials = new CredentialRepository(mongo.db);
    adapter = new FakeAuthAdapter();
  });

  afterEach(async () => {
    await service?.stop();
  });

  it("links the connection and stores the credential on a valid callback", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await startService(activeConfig(), adapter);

    const res = await hitCallback(
      `code=auth-code&state=${encodeURIComponent(validState(tenantId, principalId))}`,
    );

    expect(res.status).toBe(302);
    expect(statusOf(res)).toBe("connected");
    // The code was exchanged against the same redirect_uri begin would use.
    expect(adapter.exchanges[0].redirectUri).toBe(
      `http://localhost:3010${OAUTH_CALLBACK_PATH}`,
    );

    const linked = await connections.listByPrincipal(
      tenantId as TenantId,
      principalId as PrincipalId,
    );
    expect(linked).toHaveLength(1);
    expect(linked[0].account.providerAccountId).toBe("google-sub-1");
    expect(linked[0].state).toBe("importing");
    expect(linked[0].capabilities).toContain("writeEvents");

    const stored = await credentials.findByConnection(linked[0]._id);
    expect(
      stored?.credentialKind === "oauthRefresh"
        ? openOauthRefreshToken(TEST_CREDENTIAL_ENCRYPTION_KEY, stored)
        : null,
    ).toBe("granted-refresh-token");
  });

  it("derives suggestContacts when the callback's grant includes a contacts scope", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    // A partial contacts grant (only other-contacts) still counts.
    adapter.exchangeResult = {
      ...adapter.exchangeResult,
      grantedScopes: [
        ...adapter.exchangeResult.grantedScopes,
        "https://www.googleapis.com/auth/contacts.other.readonly",
      ],
    };
    await startService(activeConfig(), adapter);

    const res = await hitCallback(
      `code=auth-code&state=${encodeURIComponent(validState(tenantId, principalId))}`,
    );

    expect(statusOf(res)).toBe("connected");
    const [linked] = await connections.listByPrincipal(
      tenantId as TenantId,
      principalId as PrincipalId,
    );
    expect(linked.capabilities).toContain("suggestContacts");
    // The granted scopes ride the credential for the suggestions route.
    const stored = await credentials.findByConnection(linked._id);
    expect(stored?.scopes).toContain(
      "https://www.googleapis.com/auth/contacts.other.readonly",
    );
  });

  it("derives no suggestContacts when contacts scopes were left unchecked", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await startService(activeConfig(), adapter);

    const res = await hitCallback(
      `code=auth-code&state=${encodeURIComponent(validState(tenantId, principalId))}`,
    );

    // Declining the optional scopes is a NORMAL connect, not an error.
    expect(statusOf(res)).toBe("connected");
    const [linked] = await connections.listByPrincipal(
      tenantId as TenantId,
      principalId as PrincipalId,
    );
    expect(linked.capabilities).not.toContain("suggestContacts");
  });

  it("enqueues calendar-list discovery to bootstrap the new connection", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await startService(activeConfig(), adapter);

    await hitCallback(
      `code=auth-code&state=${encodeURIComponent(validState(tenantId, principalId))}`,
    );

    const [linked] = await connections.listByPrincipal(
      tenantId as TenantId,
      principalId as PrincipalId,
    );
    // The connect enqueues one calendarListSync job for the new connection; it is
    // the only trigger that starts the sync chain.
    const job = await mongo.db
      .collection(SYNC_COLLECTIONS.jobs)
      .findOne({ coalescingKey: `calendarListSync:${linked._id}` });
    expect(job?.kind).toBe("calendarListSync");
    expect(job?.connectionId).toBe(linked._id);
    expect(job?.resourceId).toBeNull();
  });

  it("redirects with an error and links nothing when the state is invalid", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await startService(activeConfig(), adapter);

    const res = await hitCallback("code=auth-code&state=forged.signature");

    expect(res.status).toBe(302);
    expect(statusOf(res)).toBe("error");
    expect(adapter.exchanges).toHaveLength(0);
    expect(
      await connections.listByPrincipal(
        tenantId as TenantId,
        principalId as PrincipalId,
      ),
    ).toHaveLength(0);
  });

  it("redirects with declined when the user rejects consent", async () => {
    await startService(activeConfig(), adapter);

    const res = await hitCallback("error=access_denied");

    expect(statusOf(res)).toBe("declined");
    expect(adapter.exchanges).toHaveLength(0);
  });

  // Unlike the signup path (checked client-side before it ever reaches here),
  // this callback used to link the connection regardless of what scopes
  // Google actually granted - discovery would then 403 and the user would see
  // a generic "couldn't update your calendar" with no mention of the real
  // cause (leaving the calendar box unchecked on Google's consent screen).
  it("redirects with missingScopes and links nothing when calendar access was not granted", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    adapter.exchangeResult = {
      ...adapter.exchangeResult,
      // Only identity was granted - both calendar scopes withheld.
      grantedScopes: ["https://www.googleapis.com/auth/userinfo.email"],
    };
    await startService(activeConfig(), adapter);

    const res = await hitCallback(
      `code=auth-code&state=${encodeURIComponent(validState(tenantId, principalId))}`,
    );

    expect(statusOf(res)).toBe("missingScopes");
    expect(
      await connections.listByPrincipal(
        tenantId as TenantId,
        principalId as PrincipalId,
      ),
    ).toHaveLength(0);
  });

  // Reconnect: the state names a specific connection. The account Google
  // returns must match it, or a wrong-account consent would silently spawn a
  // second connection and leave the broken one stuck.
  const reconnectState = (
    tenantId: string,
    principalId: string,
    connectionId: string,
  ) =>
    signOAuthState(deriveOAuthStateSecret(SECRET), {
      tenantId: tenantId as TenantId,
      principalId: principalId as PrincipalId,
      connectionId: connectionId as ConnectionId,
      provider: "google",
      issuedAt: Date.now(),
    });

  it("re-authorizes the named connection when the account matches", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    const existing = await seedConnection(
      connections,
      tenantId,
      principalId,
      "reauth@example.com",
    );
    const healthyAt = new Date("2026-07-01T00:00:00.000Z");
    await connections.updateDerivedState(
      existing.tenantId,
      existing.principalId,
      existing._id,
      {
        state: "healthy",
        stateReason: null,
        lastSyncedAt: healthyAt,
        lastHealthyAt: healthyAt,
      },
      healthyAt,
    );
    // Google returns the same account the connection is tied to.
    adapter.exchangeResult = {
      ...adapter.exchangeResult,
      account: {
        providerAccountId: existing.account.providerAccountId,
        email: "reauth@example.com",
        displayName: null,
      },
    };
    await startService(activeConfig(), adapter);

    const res = await hitCallback(
      `code=c&state=${encodeURIComponent(reconnectState(tenantId, principalId, existing._id))}`,
    );

    expect(statusOf(res)).toBe("connected");
    // Still one connection — the same one, re-authorized, not a duplicate.
    const all = await connections.listByPrincipal(
      tenantId as TenantId,
      principalId as PrincipalId,
    );
    expect(all).toHaveLength(1);
    expect(all[0]._id).toBe(existing._id);
    expect(all[0].lastHealthyAt).toEqual(healthyAt);
  });

  it("refuses and links nothing when reconnect consents with a different account", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    const existing = await seedConnection(
      connections,
      tenantId,
      principalId,
      "original@example.com",
    );
    // Google returns a DIFFERENT account than the one being reconnected.
    adapter.exchangeResult = {
      ...adapter.exchangeResult,
      account: {
        providerAccountId: "some-other-google-sub",
        email: "other@example.com",
        displayName: null,
      },
    };
    await startService(activeConfig(), adapter);

    const res = await hitCallback(
      `code=c&state=${encodeURIComponent(reconnectState(tenantId, principalId, existing._id))}`,
    );

    expect(statusOf(res)).toBe("accountMismatch");
    // No second connection was created; the original is untouched.
    const all = await connections.listByPrincipal(
      tenantId as TenantId,
      principalId as PrincipalId,
    );
    expect(all).toHaveLength(1);
    expect(all[0].account.providerAccountId).toBe(
      existing.account.providerAccountId,
    );
  });

  it("redirects with an error when the code exchange fails", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    adapter.exchangeError = new Error("bad code");
    await startService(activeConfig(), adapter);

    const res = await hitCallback(
      `code=bad&state=${encodeURIComponent(validState(tenantId, principalId))}`,
    );

    expect(statusOf(res)).toBe("error");
    expect(
      await connections.listByPrincipal(
        tenantId as TenantId,
        principalId as PrincipalId,
      ),
    ).toHaveLength(0);
  });

  const registryWithMicrosoft = (authAdapter: ProviderAuthAdapter) => {
    const config = activeConfig();
    const google = buildProviderRegistry(config, {
      google: { auth: authAdapter },
    }).get("google");
    return new ProviderRegistry(
      new Map([
        ["google", google],
        [
          "microsoft",
          {
            ...google,
            callbackPath: "/sync/microsoft",
            notificationsCallbackPath: "/sync/notifications/microsoft",
          },
        ],
      ]),
    );
  };

  it("rejects a google state presented on another provider callback with stateMismatch", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await startService(activeConfig(), adapter, registryWithMicrosoft(adapter));

    const res = await fetch(
      `${base}/sync/microsoft?code=auth-code&state=${encodeURIComponent(validState(tenantId, principalId))}`,
      { redirect: "manual" },
    );

    expect(res.status).toBe(302);
    expect(statusOf(res)).toBe("stateMismatch");
    expect(adapter.exchanges).toHaveLength(0);
    expect(
      await connections.listByPrincipal(
        tenantId as TenantId,
        principalId as PrincipalId,
      ),
    ).toHaveLength(0);
  });

  it("refuses to complete a callback in passive mode", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await startService(testConfig({ EXECUTION: "passive" }), adapter);

    const res = await hitCallback(
      `code=auth-code&state=${encodeURIComponent(validState(tenantId, principalId))}`,
    );

    expect(statusOf(res)).toBe("error");
    expect(adapter.exchanges).toHaveLength(0);
  });
});

describe("POST /internal/connections/adopt-google-authorization", () => {
  let mongo: SyncMongoService;
  let connections: ProviderConnectionRepository;
  let credentials: CredentialRepository;
  let service: SyncService;
  let base: string;

  const startService = async (overrides: Partial<SyncConfig> = {}) => {
    service = createSyncService(
      testConfig({ EXECUTION: "active", ...overrides }),
      {
        mongo,
        authAdapter: new FakeAuthAdapter(),
      },
    );
    await new Promise<void>((resolve) => service.httpServer.listen(0, resolve));
    const { port } = service.httpServer.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  };

  beforeEach(() => {
    mongo = storage.mongo();
    connections = new ProviderConnectionRepository(mongo.db);
    credentials = new CredentialRepository(mongo.db);
  });

  afterEach(async () => {
    await service?.stop();
  });

  it("adopts a signed Google authorization and bootstraps its import", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    const account = {
      providerAccountId: "google-sub-from-signin",
      email: "connected@example.com",
      displayName: "Connected User",
    };
    const grantedScopes = [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ];
    await startService();

    const res = await fetch(`${base}${ADOPT_GOOGLE_AUTHORIZATION_PATH}`, {
      method: "POST",
      headers: {
        ...signedHeaders(tenantId, principalId),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        account,
        credential: encryptInternalCredential(
          SECRET,
          "server-exchanged-refresh-token",
          { tenantId, principalId, account, grantedScopes },
        ),
        grantedScopes,
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const [connection] = await connections.listByPrincipal(
      tenantId as TenantId,
      principalId as PrincipalId,
    );
    expect(connection?.state).toBe("importing");
    expect(connection?.account.providerAccountId).toBe(
      "google-sub-from-signin",
    );
    const stored = await credentials.findByConnection(connection!._id);
    expect(
      stored?.credentialKind === "oauthRefresh"
        ? openOauthRefreshToken(TEST_CREDENTIAL_ENCRYPTION_KEY, stored)
        : null,
    ).toBe("server-exchanged-refresh-token");
    const job = await mongo.db.collection(SYNC_COLLECTIONS.jobs).findOne({
      coalescingKey: `calendarListSync:${connection!._id}`,
    });
    expect(job?.kind).toBe("calendarListSync");
  });

  it("rejects an envelope replayed under another principal", async () => {
    const tenantId = objectId();
    const sourcePrincipalId = objectId();
    const targetPrincipalId = objectId();
    const account = {
      providerAccountId: "google-sub-from-signin",
      email: "connected@example.com",
      displayName: "Connected User",
    };
    const grantedScopes = ["https://www.googleapis.com/auth/calendar.events"];
    await startService();

    const res = await fetch(`${base}${ADOPT_GOOGLE_AUTHORIZATION_PATH}`, {
      method: "POST",
      headers: {
        ...signedHeaders(tenantId, targetPrincipalId),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        account,
        credential: encryptInternalCredential(
          SECRET,
          "server-exchanged-refresh-token",
          {
            tenantId,
            principalId: sourcePrincipalId,
            account,
            grantedScopes,
          },
        ),
        grantedScopes,
      }),
    });

    expect(res.status).toBe(500);
    await expect(
      connections.listByPrincipal(
        tenantId as TenantId,
        targetPrincipalId as PrincipalId,
      ),
    ).resolves.toEqual([]);
  });

  it("rejects an unsigned authorization adoption", async () => {
    await startService();

    const res = await fetch(`${base}${ADOPT_GOOGLE_AUTHORIZATION_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
  });
});

describe("POST /internal/connections/adopt-authorization", () => {
  let mongo: SyncMongoService;
  let connections: ProviderConnectionRepository;
  let credentials: CredentialRepository;
  let service: SyncService;
  let base: string;

  const startService = async () => {
    service = createSyncService(
      testConfig({
        EXECUTION: "active",
        MICROSOFT_CLIENT_ID: "ms-id",
        MICROSOFT_CLIENT_SECRET: "ms-secret",
      }),
      {
        mongo,
        authAdapter: new FakeAuthAdapter(),
      },
    );
    await new Promise<void>((resolve) => service.httpServer.listen(0, resolve));
    const { port } = service.httpServer.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  };

  beforeEach(() => {
    mongo = storage.mongo();
    connections = new ProviderConnectionRepository(mongo.db);
    credentials = new CredentialRepository(mongo.db);
  });

  afterEach(async () => {
    await service?.stop();
  });

  it("adopts a signed Microsoft authorization and bootstraps its import", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    const account = {
      providerAccountId: "ms-oid-from-signin",
      email: "connected@example.com",
      displayName: "Connected User",
    };
    const grantedScopes = [...MICROSOFT_SCOPES];
    await startService();

    const res = await fetch(`${base}${ADOPT_AUTHORIZATION_PATH}`, {
      method: "POST",
      headers: {
        ...signedHeaders(tenantId, principalId),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        provider: "microsoft",
        account,
        credential: encryptAdoptAuthorizationCredential(
          SECRET,
          "microsoft-refresh-token",
          {
            tenantId,
            principalId,
            provider: "microsoft",
            account,
            grantedScopes,
          },
        ),
        grantedScopes,
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const [connection] = await connections.listByPrincipal(
      tenantId as TenantId,
      principalId as PrincipalId,
    );
    expect(connection?.provider).toBe("microsoft");
    expect(connection?.state).toBe("importing");
    expect(connection?.account.providerAccountId).toBe("ms-oid-from-signin");
    const stored = await credentials.findByConnection(connection!._id);
    expect(
      stored?.credentialKind === "oauthRefresh"
        ? openOauthRefreshToken(TEST_CREDENTIAL_ENCRYPTION_KEY, stored)
        : null,
    ).toBe("microsoft-refresh-token");
  });
});

describe("GET /internal/calendars", () => {
  let mongo: SyncMongoService;
  let calendars: ProviderCalendarRepository;
  let service: SyncService;
  let base: string;

  const startService = async (config: SyncConfig = testConfig()) => {
    service = createSyncService(config, { mongo });
    await new Promise<void>((resolve) => service.httpServer.listen(0, resolve));
    const { port } = service.httpServer.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  };

  const seedCalendar = (
    tenantId: string,
    principalId: string,
    overrides: {
      connectionId?: string;
      displayName?: string;
      active?: boolean;
    } = {},
  ) =>
    calendars.upsertByProviderCalendar({
      tenantId: tenantId as TenantId,
      principalId: principalId as PrincipalId,
      connectionId: (overrides.connectionId ?? objectId()) as ConnectionId,
      providerCalendarId: objectId(),
      displayName: overrides.displayName ?? "My Calendar",
      color: null,
      active: overrides.active ?? true,
      primary: false,
      accessRole: "owner",
      capabilities: {
        canReadEvents: true,
        canWriteEvents: true,
        canReadBusy: true,
        canInviteAttendees: true,
      },
    });

  const get = (tenantId: string, principalId: string, query = "") =>
    fetch(`${base}${CALENDARS_PATH}${query}`, {
      headers: signedHeaders(tenantId, principalId),
    });

  beforeEach(() => {
    mongo = storage.mongo();
    calendars = new ProviderCalendarRepository(mongo.db);
  });

  afterEach(async () => {
    await service?.stop();
  });

  it("returns the caller's calendars mapped to the wire contract", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await seedCalendar(tenantId, principalId, { displayName: "Work" });
    await startService();

    const res = await get(tenantId, principalId);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      calendars: Array<Record<string, unknown>>;
    };
    expect(body.calendars).toHaveLength(1);
    expect(body.calendars[0]).toMatchObject({
      principalId,
      displayName: "Work",
      accessRole: "owner",
    });
    expect(typeof body.calendars[0].createdAt).toBe("string");
  });

  it("scopes results to the authenticated principal", async () => {
    const tenantId = objectId();
    const mine = objectId();
    const other = objectId();
    await seedCalendar(tenantId, mine, { displayName: "Mine" });
    await seedCalendar(tenantId, other, { displayName: "Theirs" });
    await startService();

    const body = (await (await get(tenantId, mine)).json()) as {
      calendars: Array<{ displayName: string }>;
    };
    expect(body.calendars).toHaveLength(1);
    expect(body.calendars[0].displayName).toBe("Mine");
  });

  it("narrows to one connection when connectionId is given", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    const conn = objectId();
    await seedCalendar(tenantId, principalId, { connectionId: conn });
    await seedCalendar(tenantId, principalId, { connectionId: objectId() });
    await startService();

    const body = (await (
      await get(tenantId, principalId, `?connectionId=${conn}`)
    ).json()) as { calendars: unknown[] };
    expect(body.calendars).toHaveLength(1);
  });

  it("returns only active calendars when activeOnly=true", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await seedCalendar(tenantId, principalId, { active: true });
    await seedCalendar(tenantId, principalId, { active: false });
    await startService();

    const all = (await (await get(tenantId, principalId)).json()) as {
      calendars: unknown[];
    };
    const activeOnly = (await (
      await get(tenantId, principalId, "?activeOnly=true")
    ).json()) as { calendars: unknown[] };

    expect(all.calendars).toHaveLength(2);
    expect(activeOnly.calendars).toHaveLength(1);
  });

  it("rejects a malformed connectionId filter", async () => {
    await startService();

    const res = await get(objectId(), objectId(), "?connectionId=nope");

    expect(res.status).toBe(400);
  });

  it("rejects a repeated connectionId that Express parses as an array", async () => {
    await startService();
    const conn = objectId();

    const res = await get(
      objectId(),
      objectId(),
      `?connectionId=${conn}&connectionId=${objectId()}`,
    );

    expect(res.status).toBe(400);
  });

  it("rejects an unsigned request", async () => {
    await startService();

    const res = await fetch(`${base}${CALENDARS_PATH}`);

    expect(res.status).toBe(401);
  });
});

describe("GET /internal/events/full", () => {
  let mongo: SyncMongoService;
  let service: SyncService;
  let base: string;

  const startService = async (config: SyncConfig = testConfig()) => {
    service = createSyncService(config, { mongo });
    await new Promise<void>((resolve) => service.httpServer.listen(0, resolve));
    const { port } = service.httpServer.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  };

  const timed = {
    kind: "timed" as const,
    start: "2026-07-14T09:00:00-06:00",
    end: "2026-07-14T10:00:00-06:00",
    timeZone: "America/Denver",
  };

  // Seed a full event record, validated through its schema.
  const seedEvent = (
    tenantId: string,
    principalId: string,
    overrides: Partial<EventRecord> = {},
  ) => {
    const record = EventRecordSchema.parse({
      _id: objectId(),
      tenantId,
      principalId,
      origin: "compass",
      calendarId: objectId(),
      clientEventId: null,
      connectionId: null,
      providerEventId: null,
      providerVersion: null,
      providerUpdatedAt: null,
      deliveryState: null,
      providerMetadata: null,
      content: {
        title: "Standup",
        description: "Daily sync",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
      },
      schedule: timed,
      recurrence: { kind: "single" },
      lifecycleState: "active",
      generation: 0,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-02T00:00:00.000Z"),
      confirmedAt: null,
      ...overrides,
    });
    return mongo.db
      .collection<EventRecord>("events")
      .insertOne(record)
      .then(() => record);
  };

  const seedOccurrence = (
    tenantId: string,
    principalId: string,
    overrides: Partial<EventOccurrenceRecord> = {},
  ) => {
    const start = overrides.startAt ?? new Date();
    const record = EventOccurrenceRecordSchema.parse({
      _id: objectId(),
      tenantId,
      principalId,
      eventId: objectId(),
      occurrenceKey: `${objectId()}:${start.toISOString()}`,
      calendarId: objectId(),
      schedule: timed,
      startAt: start,
      endAt: new Date(start.getTime() + 60 * 60_000),
      busy: true,
      title: "Standup",
      cancelled: false,
      generation: 0,
      ...overrides,
    });
    return mongo.db
      .collection<EventOccurrenceRecord>("event_occurrences")
      .insertOne(record);
  };

  const wideRange = () =>
    `start=${dayjs().subtract(1, "day").toISOString()}&end=${dayjs()
      .add(1, "day")
      .toISOString()}`;

  const get = (tenantId: string, principalId: string, query: string) =>
    fetch(`${base}${EVENTS_FULL_PATH}?${query}`, {
      headers: signedHeaders(tenantId, principalId),
    });

  beforeEach(() => {
    mongo = storage.mongo();
  });

  afterEach(async () => {
    await service?.stop();
  });

  it("joins an occurrence to its single event and returns full content", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    const calendarId = objectId() as EventRecord["calendarId"];
    const event = await seedEvent(tenantId, principalId, {
      calendarId,
      recurrence: { kind: "single" },
    });
    await seedOccurrence(tenantId, principalId, {
      eventId: event._id,
      calendarId: calendarId as EventOccurrenceRecord["calendarId"],
    });
    await startService();

    const body = (await (
      await get(
        tenantId,
        principalId,
        `calendarIds=${calendarId}&${wideRange()}`,
      )
    ).json()) as { instances: unknown[]; nextCursor: string | null };

    expect(body.instances).toHaveLength(1);
    expect(body.instances[0]).toMatchObject({
      eventId: event._id,
      recurrence: { kind: "single" },
      content: { title: "Standup", description: "Daily sync" },
    });
  });

  // Express's default "extended" query parser (qs) turns 21+ repeated keys
  // into an object (arrayLimit: 20), which made this route 400 for any user
  // with more than 20 calendars. Guards the "simple" parser in buildSyncApp.
  it("accepts more than 20 repeated calendarIds params", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    const calendarId = objectId() as EventRecord["calendarId"];
    const event = await seedEvent(tenantId, principalId, { calendarId });
    await seedOccurrence(tenantId, principalId, {
      eventId: event._id,
      calendarId: calendarId as EventOccurrenceRecord["calendarId"],
    });
    await startService();

    const ids = [calendarId, ...Array.from({ length: 24 }, () => objectId())];
    const query = ids.map((id) => `calendarIds=${id}`).join("&");
    const res = await get(tenantId, principalId, `${query}&${wideRange()}`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { instances: unknown[] };
    expect(body.instances).toHaveLength(1);
    expect(body.instances[0]).toMatchObject({ eventId: event._id });
  });

  it("returns instance rows plus one back-filled series master row", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    const calendarId = objectId() as EventRecord["calendarId"];
    const master = await seedEvent(tenantId, principalId, {
      calendarId,
      recurrence: { kind: "seriesMaster", rules: ["RRULE:FREQ=DAILY"] },
    });
    await seedOccurrence(tenantId, principalId, {
      eventId: master._id,
      calendarId: calendarId as EventOccurrenceRecord["calendarId"],
      startAt: new Date(),
    });
    await startService();

    const body = (await (
      await get(
        tenantId,
        principalId,
        `calendarIds=${calendarId}&${wideRange()}`,
      )
    ).json()) as {
      instances: Array<{ recurrence: { kind: string } }>;
    };

    const kinds = body.instances.map((i) => i.recurrence.kind).sort();
    expect(kinds).toEqual(["occurrence", "series"]);
  });

  it("second-hops to back-fill a master reachable only via an exception", async () => {
    // The only in-range row is an OVERRIDDEN instance whose occurrence points at
    // the exception event, not the master. The master is fetched only by the
    // route's second findByIds hop (via the exception's seriesId), so this proves
    // that hop actually runs and merges.
    const tenantId = objectId();
    const principalId = objectId();
    const calendarId = objectId() as EventRecord["calendarId"];
    const master = await seedEvent(tenantId, principalId, {
      calendarId,
      recurrence: { kind: "seriesMaster", rules: ["RRULE:FREQ=DAILY"] },
    });
    const exception = await seedEvent(tenantId, principalId, {
      calendarId,
      recurrence: {
        kind: "exception",
        seriesId: master._id,
        recurrenceId: "2026-07-14T15:00:00.000Z" as never,
        cancelled: false,
      },
    });
    // Occurrence for the exception only — no occurrence for the master in range.
    await seedOccurrence(tenantId, principalId, {
      eventId: exception._id,
      calendarId: calendarId as EventOccurrenceRecord["calendarId"],
      startAt: new Date(),
    });
    await startService();

    const body = (await (
      await get(
        tenantId,
        principalId,
        `calendarIds=${calendarId}&${wideRange()}`,
      )
    ).json()) as {
      instances: Array<{
        eventId: string;
        recurrence: { kind: string; recurrenceId?: string };
      }>;
    };

    const occurrence = body.instances.find(
      (i) => i.recurrence.kind === "occurrence",
    );
    const series = body.instances.find((i) => i.recurrence.kind === "series");
    // The overridden instance links to the master and is addressed by its
    // ORIGINAL start, and the master row was back-filled via the second hop.
    expect(occurrence?.eventId).toBe(master._id);
    expect(occurrence?.recurrence.recurrenceId).toBe(
      "2026-07-14T15:00:00.000Z",
    );
    expect(series?.eventId).toBe(master._id);
  });

  it("scopes the read to the signed principal", async () => {
    const tenantId = objectId();
    const owner = objectId();
    const stranger = objectId();
    const calendarId = objectId() as EventRecord["calendarId"];
    const event = await seedEvent(tenantId, owner, { calendarId });
    await seedOccurrence(tenantId, owner, {
      eventId: event._id,
      calendarId: calendarId as EventOccurrenceRecord["calendarId"],
    });
    await startService();

    const body = (await (
      await get(tenantId, stranger, `calendarIds=${calendarId}&${wideRange()}`)
    ).json()) as { instances: unknown[] };

    expect(body.instances).toEqual([]);
  });

  it("rejects an unsigned request", async () => {
    await startService();

    const res = await fetch(
      `${base}${EVENTS_FULL_PATH}?calendarIds=${objectId()}`,
    );

    expect(res.status).toBe(401);
  });

  it("create → full-range read returns a new weekly series in the create week", async () => {
    // Real command path (put + reproject), not a hand-seeded occurrence. Repro
    // for series roots that vanish from the SPA week query when BYDAY skips
    // the DTSTART weekday — the create week's narrow range must still see an
    // occurrence (and therefore the back-filled series master).
    const tenantId = objectId();
    const principalId = objectId();
    const calendarId = objectId();
    await startService();

    const eventId = objectId();
    const createRes = await fetch(`${base}${COMMANDS_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...signedHeaders(tenantId, principalId),
      },
      body: JSON.stringify({
        idempotencyKey: `idem-${objectId()}`,
        eventId,
        input: {
          kind: "create",
          calendarId,
          content: {
            title: "Weekly standup",
            description: "",
            location: null,
            organizer: null,
            attendees: [],
            conference: null,
          },
          schedule: {
            kind: "timed",
            start: "2026-07-24T12:00:00-06:00",
            end: "2026-07-24T13:00:00-06:00",
            timeZone: "America/Denver",
          },
          // Friday start + Sunday BYDAY — the staging-shaped mismatch.
          recurrence: {
            kind: "series",
            rules: ["RRULE:FREQ=WEEKLY;COUNT=12;INTERVAL=1;BYDAY=SU"],
          },
        },
        expectedVersion: null,
      }),
    });
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as {
      command: { eventId: string; outcome: { state: string } };
    };
    expect(created.command.outcome.state).toBe("confirmed");
    expect(created.command.eventId).toBe(eventId);

    // SPA week window containing the Friday DTSTART (ends Saturday night).
    const weekQuery =
      `calendarIds=${calendarId}` +
      `&start=${encodeURIComponent("2026-07-19T00:00:00-06:00")}` +
      `&end=${encodeURIComponent("2026-07-25T23:59:59-06:00")}`;
    const body = (await (
      await get(tenantId, principalId, weekQuery)
    ).json()) as {
      instances: Array<{
        eventId: string;
        recurrence: { kind: string };
        schedule: { start: string };
      }>;
    };

    const kinds = body.instances.map((i) => i.recurrence.kind).sort();
    expect(kinds).toContain("occurrence");
    expect(kinds).toContain("series");
    expect(
      body.instances.some(
        (i) =>
          i.eventId === eventId &&
          i.recurrence.kind === "occurrence" &&
          i.schedule.start.startsWith("2026-07-24"),
      ),
    ).toBe(true);
    expect(
      body.instances.some(
        (i) => i.eventId === eventId && i.recurrence.kind === "series",
      ),
    ).toBe(true);
  });
});

describe("POST /internal/connections/refresh", () => {
  let mongo: SyncMongoService;
  let connections: ProviderConnectionRepository;
  let resources: SyncResourceRepository;
  let jobs: JobRepository;
  let service: SyncService;
  let base: string;

  const startService = async () => {
    service = createSyncService(testConfig({ EXECUTION: "active" }), { mongo });
    await new Promise<void>((resolve) => service.httpServer.listen(0, resolve));
    const { port } = service.httpServer.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  };

  beforeEach(() => {
    mongo = storage.mongo();
    connections = new ProviderConnectionRepository(mongo.db);
    resources = new SyncResourceRepository(mongo.db);
    jobs = new JobRepository(mongo.db);
  });

  afterEach(async () => {
    await service?.stop();
  });

  const seedEventsResource = async (tenantId: string, principalId: string) => {
    const connection = await seedConnection(
      connections,
      tenantId,
      principalId,
      "me@example.com",
    );
    const calendar = await seedProviderCalendar(
      new ProviderCalendarRepository(mongo.db),
      {
        tenantId: connection.tenantId,
        principalId: connection.principalId,
        connectionId: connection._id,
      },
    );
    const resource = await ensureEventsResource(resources, calendar);
    return { connection, resource };
  };

  it("second POST over a pending job returns enqueued: 1 (boosted, not silent 0)", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await seedEventsResource(tenantId, principalId);
    await startService();

    const first = await fetch(`${base}${REFRESH_PATH}`, {
      method: "POST",
      headers: signedHeaders(tenantId, principalId),
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      enqueued: 1,
      inFlight: 0,
      resources: 1,
    });

    const second = await fetch(`${base}${REFRESH_PATH}`, {
      method: "POST",
      headers: signedHeaders(tenantId, principalId),
    });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      enqueued: 1,
      inFlight: 0,
      resources: 1,
    });

    const pending = await mongo.db.collection("jobs").findOne({
      kind: "incrementalPull",
      state: "pending",
    });
    expect(pending?.["priority"]).toBe(JOB_PRIORITY.user);
  });

  it("returns inFlight: 1 when the job is already claimed", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    const { resource } = await seedEventsResource(tenantId, principalId);
    await jobs.enqueue({
      tenantId: resource.tenantId,
      principalId: resource.principalId,
      connectionId: resource.connectionId,
      resourceId: resource._id,
      commandId: null,
      kind: "incrementalPull",
      priority: JOB_PRIORITY.background,
      runAfter: new Date(Date.now() - 1000),
      coalescingKey: `incrementalPull:${resource._id}`,
    });
    const claimed = await jobs.claimDueJob("worker-1", new Date(), 60_000);
    expect(claimed?.state).toBe("claimed");

    await startService();
    const res = await fetch(`${base}${REFRESH_PATH}`, {
      method: "POST",
      headers: signedHeaders(tenantId, principalId),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      enqueued: 0,
      inFlight: 1,
      resources: 1,
    });

    const still = await jobs.findById(
      resource.tenantId,
      resource.principalId,
      claimed!._id,
    );
    expect(still?.leaseOwner).toBe("worker-1");
    expect(still?.state).toBe("claimed");
  });

  it("batch foreground refresh enqueues only stale ready resources", async () => {
    const principalId = objectId();
    const { resource } = await seedEventsResource(principalId, principalId);
    await resources.setBootstrapState(
      resource.tenantId,
      resource.principalId,
      resource._id,
      "ready",
    );
    await startService();

    const res = await fetch(`${base}${FOREGROUND_REFRESH_PATH}`, {
      method: "POST",
      headers: serviceSignedHeaders(),
      body: JSON.stringify({ principalIds: [principalId] }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      enqueued: 1,
      inFlight: 0,
      resources: 1,
    });
  });
});

describe("POST /internal/connections/credential", () => {
  let mongo: SyncMongoService;
  let connections: ProviderConnectionRepository;
  let credentials: CredentialRepository;
  let service: SyncService;
  let base: string;
  let appleAuth: FakeAppleAuthAdapter;

  const startService = async () => {
    service = createSyncService(testConfig({ EXECUTION: "active" }), {
      mongo,
      registry: registryWithApple(appleAuth),
    });
    await new Promise<void>((resolve) => service.httpServer.listen(0, resolve));
    const { port } = service.httpServer.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  };

  const connect = async (
    tenantId: string,
    principalId: string,
    username: string,
    secret: string,
  ) =>
    fetch(`${base}${CREDENTIAL_PATH}`, {
      method: "POST",
      headers: {
        ...signedHeaders(tenantId, principalId),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        provider: "apple",
        envelope: encryptCredentialConnectPayload(
          SECRET,
          { username, secret },
          { tenantId, principalId, provider: "apple" },
        ),
      }),
    });

  beforeEach(() => {
    mongo = storage.mongo();
    connections = new ProviderConnectionRepository(mongo.db);
    credentials = new CredentialRepository(mongo.db);
    appleAuth = new FakeAppleAuthAdapter();
  });

  afterEach(async () => {
    await service?.stop();
  });

  it("creates a connection, stores an encrypted password, and enqueues calendarListSync", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    const secret = "app-specific-password-xyz";
    await startService();

    const logSizeBefore = statSync("logs/app.log").size;
    const res = await connect(tenantId, principalId, "User@iCloud.com", secret);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { connectionId: string };
    expect(body.connectionId).toMatch(/^[a-f0-9]{24}$/);
    expect(appleAuth.validateCalls).toEqual([
      { username: "User@iCloud.com", secret },
    ]);

    const [connection] = await connections.listByPrincipal(
      tenantId as TenantId,
      principalId as PrincipalId,
    );
    expect(connection?.provider).toBe("apple");
    expect(connection?.account.providerAccountId).toBe("user@icloud.com");
    expect(connection?.capabilities).toEqual([...APPLE_PROVIDER_CAPABILITIES]);

    const stored = await credentials.findByConnection(body.connectionId);
    expect(stored?.credentialKind).toBe("password");
    const raw = await mongo.db
      .collection(SYNC_COLLECTIONS.credentials)
      .findOne({ _id: body.connectionId });
    expect(JSON.stringify(raw)).not.toContain(secret);
    if (stored?.credentialKind === "password") {
      expect(
        decryptCredentialAtRest(TEST_CREDENTIAL_ENCRYPTION_KEY, {
          ciphertext: stored.secretCiphertext,
          iv: stored.secretIv,
          tag: stored.secretTag,
          keyVersion: stored.keyVersion,
        }),
      ).toBe(secret);
    }

    const job = await mongo.db.collection(SYNC_COLLECTIONS.jobs).findOne({
      coalescingKey: `calendarListSync:${body.connectionId}`,
    });
    expect(job?.kind).toBe("calendarListSync");

    const logTail = readFileSync("logs/app.log")
      .subarray(logSizeBefore)
      .toString("utf8");
    expect(logTail).not.toContain(secret);
  });

  it("coalesces calendarListSync when reconnecting the same username", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await startService();

    const first = await connect(
      tenantId,
      principalId,
      "user@icloud.com",
      "first-password",
    );
    const firstBody = (await first.json()) as { connectionId: string };
    const second = await connect(
      tenantId,
      principalId,
      "user@icloud.com",
      "second-password",
    );
    const secondBody = (await second.json()) as { connectionId: string };

    expect(secondBody.connectionId).toBe(firstBody.connectionId);
    const jobs = await mongo.db
      .collection(SYNC_COLLECTIONS.jobs)
      .find({ coalescingKey: `calendarListSync:${firstBody.connectionId}` })
      .toArray();
    expect(jobs).toHaveLength(1);

    const stored = await credentials.findByConnection(firstBody.connectionId);
    if (stored?.credentialKind === "password") {
      expect(
        decryptCredentialAtRest(TEST_CREDENTIAL_ENCRYPTION_KEY, {
          ciphertext: stored.secretCiphertext,
          iv: stored.secretIv,
          tag: stored.secretTag,
          keyVersion: stored.keyVersion,
        }),
      ).toBe("second-password");
    }
  });

  it("returns 401 invalidCredential when validation fails", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    appleAuth.validateError = new ProviderAuthError(
      "authorizationRevoked",
      "Apple rejected the app-specific password",
    );
    await startService();

    const res = await connect(
      tenantId,
      principalId,
      "user@icloud.com",
      "wrong-password",
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalidCredential" });
    expect(
      await connections.listByPrincipal(
        tenantId as TenantId,
        principalId as PrincipalId,
      ),
    ).toHaveLength(0);
  });

  it("returns 503 when validation is throttled", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    appleAuth.validateError = new ProviderAuthError(
      "refreshFailed",
      "Apple CalDAV throttled credential validation",
    );
    await startService();

    const res = await connect(
      tenantId,
      principalId,
      "user@icloud.com",
      "app-password",
    );

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "provider_throttled" });
  });
});
