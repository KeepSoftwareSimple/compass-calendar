import { faker } from "@faker-js/faker";
import { NodeEnv } from "@core/constants/core.constants";
import {
  GOOGLE_SCOPE_CALENDAR_EVENTS,
  GOOGLE_SCOPE_CONTACTS_OTHER_READONLY,
  GOOGLE_SCOPE_CONTACTS_READONLY,
} from "@core/providers/google.scopes";
import {
  MICROSOFT_SCOPE_CALENDARS_READWRITE,
  MICROSOFT_SCOPE_PEOPLE_READ,
} from "@core/providers/microsoft.scopes";
import { type ContactSuggestion } from "@core/types/contact.contracts";
import {
  type PrincipalId,
  type ProviderAccountId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import {
  seedOauthCredential,
  TEST_CREDENTIAL_ENCRYPTION_KEY,
} from "@sync/__tests__/helpers/credential-encryption";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { createSyncService, type SyncService } from "@sync/app";
import { signInternalRequest } from "@sync/auth/internal-auth";
import { type SyncConfig } from "@sync/config/sync.config";
import {
  type ProviderAuthAdapter,
  type ProviderAuthorization,
  type RefreshedCredential,
} from "@sync/providers/provider-auth.port";
import {
  type ContactsPort,
  ContactsSearchError,
  type ContactsSearchInput,
} from "@sync/providers/provider-contacts.port";
import {
  buildProviderRegistry,
  ProviderRegistry,
} from "@sync/providers/provider-registry";
import { CONTACTS_SUGGESTIONS_PATH } from "@sync/server/contacts.routes";
import { CredentialRepository } from "@sync/storage/repositories/credential.repository";
import { ProviderConnectionRepository } from "@sync/storage/repositories/provider-connection.repository";
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
    EXECUTION: "active",
    MAX_CONCURRENCY: 4,
    CREDENTIAL_ENCRYPTION_KEY: TEST_CREDENTIAL_ENCRYPTION_KEY,
    ...overrides,
  }) as SyncConfig;

// Custody needs only refreshAccessToken here: the stored credential has no
// cached access token, so every suggestion request mints one.
class FakeAuthAdapter implements ProviderAuthAdapter {
  minted = 0;
  buildAuthorizationUrl(): string {
    throw new Error("unused");
  }
  exchangeAuthorizationCode(): Promise<ProviderAuthorization> {
    throw new Error("unused");
  }
  async refreshAccessToken(): Promise<RefreshedCredential> {
    this.minted += 1;
    return {
      accessToken: "minted-access-token",
      expiresAt: new Date(Date.now() + 3_600_000),
      grantedScopes: [],
    };
  }
  async revoke(): Promise<void> {}
}

class FakeContactsPort implements ContactsPort {
  calls: ContactsSearchInput[] = [];
  result: ContactSuggestion[] = [];
  error?: unknown;
  async searchContacts(
    input: ContactsSearchInput,
  ): Promise<ContactSuggestion[]> {
    this.calls.push(input);
    if (this.error) throw this.error;
    return this.result;
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

describe("GET /internal/contacts/suggestions", () => {
  let mongo: SyncMongoService;
  let connections: ProviderConnectionRepository;
  let credentials: CredentialRepository;
  let service: SyncService;
  let base: string;
  let authAdapter: FakeAuthAdapter;
  let contacts: FakeContactsPort;

  const startService = async (
    config: SyncConfig = testConfig(),
    registry?: ProviderRegistry,
  ) => {
    service = createSyncService(config, {
      mongo,
      authAdapter,
      contacts,
      registry,
    });
    await new Promise<void>((resolve) => service.httpServer.listen(0, resolve));
    const { port } = service.httpServer.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  };

  const seedContactsConnection = async (
    tenantId: string,
    principalId: string,
    scopes: string[],
  ) => {
    const connection = await connections.upsertByProviderAccount({
      tenantId: tenantId as TenantId,
      principalId: principalId as PrincipalId,
      provider: "google",
      account: {
        providerAccountId: objectId() as ProviderAccountId,
        email: "me@example.com",
        displayName: null,
      },
      capabilities: ["readEvents", "suggestContacts"],
      state: "healthy",
      stateReason: null,
    });
    await seedOauthCredential(credentials, {
      connectionId: connection._id,
      provider: "google",
      refreshToken: "stored-refresh-token",
      scopes,
    });
    return connection;
  };

  const seedMicrosoftContactsConnection = async (
    tenantId: string,
    principalId: string,
    scopes: string[],
  ) => {
    const connection = await connections.upsertByProviderAccount({
      tenantId: tenantId as TenantId,
      principalId: principalId as PrincipalId,
      provider: "microsoft",
      account: {
        providerAccountId: objectId() as ProviderAccountId,
        email: "me@outlook.com",
        displayName: null,
      },
      capabilities: ["readEvents", "suggestContacts"],
      state: "healthy",
      stateReason: null,
    });
    await seedOauthCredential(credentials, {
      connectionId: connection._id,
      provider: "microsoft",
      refreshToken: "stored-refresh-token",
      scopes,
    });
    return connection;
  };

  const registryWithMicrosoft = () => {
    const google = buildProviderRegistry(testConfig(), {
      google: { auth: authAdapter, contacts },
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
            adapters: { ...google.adapters, auth: authAdapter, contacts },
          },
        ],
      ]),
    );
  };

  const suggest = (tenantId: string, principalId: string, q?: string) =>
    fetch(
      `${base}${CONTACTS_SUGGESTIONS_PATH}${
        q === undefined ? "" : `?q=${encodeURIComponent(q)}`
      }`,
      { headers: signedHeaders(tenantId, principalId) },
    );

  beforeEach(() => {
    mongo = storage.mongo();
    connections = new ProviderConnectionRepository(mongo.db);
    credentials = new CredentialRepository(mongo.db);
    authAdapter = new FakeAuthAdapter();
    contacts = new FakeContactsPort();
  });

  afterEach(async () => {
    await service?.stop();
  });

  it("returns suggestions from the port, scoped by the credential's granted contacts scopes", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await seedContactsConnection(tenantId, principalId, [
      GOOGLE_SCOPE_CALENDAR_EVENTS,
      GOOGLE_SCOPE_CONTACTS_READONLY,
      GOOGLE_SCOPE_CONTACTS_OTHER_READONLY,
    ]);
    contacts.result = [
      { email: "alice@example.com", displayName: "Alice Doe" },
      { email: "albert@example.com", displayName: null },
    ];
    await startService();

    const res = await suggest(tenantId, principalId, "al");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      suggestions: [
        { email: "alice@example.com", displayName: "Alice Doe" },
        { email: "albert@example.com", displayName: null },
      ],
    });
    expect(contacts.calls).toEqual([
      {
        accessToken: "minted-access-token",
        query: "al",
        sources: { contacts: true, otherContacts: true },
      },
    ]);
  });

  it("passes only the granted surface to the port on a partial grant", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await seedContactsConnection(tenantId, principalId, [
      GOOGLE_SCOPE_CALENDAR_EVENTS,
      GOOGLE_SCOPE_CONTACTS_OTHER_READONLY,
    ]);
    await startService();

    const res = await suggest(tenantId, principalId, "al");

    expect(res.status).toBe(200);
    expect(contacts.calls).toEqual([
      {
        accessToken: "minted-access-token",
        query: "al",
        sources: { contacts: false, otherContacts: true },
      },
    ]);
  });

  it("returns an empty 200 for a sub-minimum query without touching the provider", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await seedContactsConnection(tenantId, principalId, [
      GOOGLE_SCOPE_CONTACTS_READONLY,
    ]);
    await startService();

    // One character — and a padded one character, which must trim first.
    for (const q of ["a", "  a  "]) {
      const res = await suggest(tenantId, principalId, q);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ suggestions: [] });
    }
    expect(contacts.calls).toHaveLength(0);
    // No access token was minted either — the provider was never involved.
    expect(authAdapter.minted).toBe(0);
  });

  it("refuses typed when no connection has the contacts capability", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    // A connection WITHOUT the contacts grant (calendar-only capabilities).
    await connections.upsertByProviderAccount({
      tenantId: tenantId,
      principalId: principalId,
      provider: "google",
      account: {
        providerAccountId: objectId() as ProviderAccountId,
        email: "me@example.com",
        displayName: null,
      },
      capabilities: ["readEvents", "writeEvents"],
      state: "healthy",
      stateReason: null,
    });
    await startService();

    const res = await suggest(tenantId, principalId, "al");

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "contacts_not_granted" });
    expect(contacts.calls).toHaveLength(0);
  });

  it("never serves another principal's contacts grant", async () => {
    const tenantId = objectId();
    const owner = objectId();
    const stranger = objectId();
    await seedContactsConnection(tenantId, owner, [
      GOOGLE_SCOPE_CONTACTS_READONLY,
    ]);
    await startService();

    const res = await suggest(tenantId, stranger, "al");

    expect(res.status).toBe(403);
    expect(contacts.calls).toHaveLength(0);
  });

  it("returns suggestions for a Microsoft connection scoped by People.Read", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await seedMicrosoftContactsConnection(tenantId, principalId, [
      MICROSOFT_SCOPE_CALENDARS_READWRITE,
      MICROSOFT_SCOPE_PEOPLE_READ,
    ]);
    contacts.result = [{ email: "bob@example.com", displayName: "Bob Smith" }];
    await startService(testConfig(), registryWithMicrosoft());

    const res = await suggest(tenantId, principalId, "bo");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      suggestions: [{ email: "bob@example.com", displayName: "Bob Smith" }],
    });
    expect(contacts.calls).toEqual([
      {
        accessToken: "minted-access-token",
        query: "bo",
        sources: { contacts: true, otherContacts: false },
      },
    ]);
  });

  it("maps a provider rate-limit to a typed retryable 429", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await seedContactsConnection(tenantId, principalId, [
      GOOGLE_SCOPE_CONTACTS_READONLY,
    ]);
    contacts.error = new ContactsSearchError(
      "rateLimited",
      "Google throttled the contact search",
    );
    await startService();

    const res = await suggest(tenantId, principalId, "al");

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "rate_limited",
      retryable: true,
    });
  });

  it("maps other provider search failures to a typed retryable 503", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await seedContactsConnection(tenantId, principalId, [
      GOOGLE_SCOPE_CONTACTS_READONLY,
    ]);
    contacts.error = new ContactsSearchError("searchFailed", "Search failed");
    await startService();

    const res = await suggest(tenantId, principalId, "al");

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "contacts_unavailable",
      retryable: true,
    });
  });

  it("rejects a missing or oversized query", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await seedContactsConnection(tenantId, principalId, [
      GOOGLE_SCOPE_CONTACTS_READONLY,
    ]);
    await startService();

    const missing = await suggest(tenantId, principalId);
    expect(missing.status).toBe(400);
    const oversized = await suggest(tenantId, principalId, "a".repeat(257));
    expect(oversized.status).toBe(400);
    expect(contacts.calls).toHaveLength(0);
  });

  it("refuses in passive mode", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    await seedContactsConnection(tenantId, principalId, [
      GOOGLE_SCOPE_CONTACTS_READONLY,
    ]);
    await startService(testConfig({ EXECUTION: "passive" }));

    const res = await suggest(tenantId, principalId, "al");

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "provider_work_disabled" });
  });

  it("rejects an unsigned request", async () => {
    await startService();

    const res = await fetch(`${base}${CONTACTS_SUGGESTIONS_PATH}?q=al`);

    expect(res.status).toBe(401);
  });
});
