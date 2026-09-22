import { Status } from "@core/errors/status.codes";
import { encryptCredentialConnectPayload } from "@core/security/internal-credential-envelope";
import { BaseDriver } from "@backend/__tests__/drivers/base.driver";
import { UtilDriver } from "@backend/__tests__/drivers/util.driver";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { restoreFileMocks } from "@backend/__tests__/helpers/mock.setup";
import { CONFIG } from "@backend/common/constants/config.constants";
import { INVALID_APPLE_CREDENTIAL_MESSAGE } from "@backend/common/services/sync-service/sync-credential-connect";
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

const AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";

describe("auth.controller connections API", () => {
  const baseDriver = new BaseDriver();
  const originalMicrosoftId = CONFIG.MICROSOFT_CLIENT_ID;
  const originalMicrosoftSecret = CONFIG.MICROSOFT_CLIENT_SECRET;
  const originalCredentialKey = CONFIG.SYNC_CREDENTIAL_ENCRYPTION_KEY;

  beforeAll(() => setupTestDb(import.meta.url));
  beforeEach(cleanupCollections);
  afterAll(cleanupTestDb);

  afterEach(() => {
    CONFIG.MICROSOFT_CLIENT_ID = originalMicrosoftId;
    CONFIG.MICROSOFT_CLIENT_SECRET = originalMicrosoftSecret;
    CONFIG.SYNC_CREDENTIAL_ENCRYPTION_KEY = originalCredentialKey;
    restoreFileMocks();
  });

  const sessionFor = (userId: string) =>
    baseDriver.setSessionPlugin({ userId });

  const appleEnvelope = (
    tenantId: string,
    principalId: string,
    username: string,
    secret: string,
  ) =>
    encryptCredentialConnectPayload(
      CONFIG.SYNC_INTERNAL_AUTH_TOKEN,
      { username, secret },
      { tenantId, principalId, provider: "apple" },
    );

  const postCredential = (userId: string, username: string, secret: string) =>
    baseDriver
      .getServer()
      .post("/api/auth/connections/credential")
      .use(sessionFor(userId))
      .send({
        provider: "apple",
        envelope: appleEnvelope(userId, userId, username, secret),
      });

  it("returns the same redirect body from the new begin route and the Google alias", async () => {
    const { user } = await UtilDriver.setupTestUser();
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      beginConnection: async () => ({
        ok: true,
        value: { authorizationUrl: AUTHORIZATION_URL },
        correlationId: "corr-1",
      }),
    } as never);

    const expected = {
      kind: "redirect",
      authorizationUrl: AUTHORIZATION_URL,
    };

    const response = await baseDriver
      .getServer()
      .post("/api/auth/connections/begin")
      .use(sessionFor(user._id.toString()))
      .send({ provider: "google" })
      .expect(Status.OK);

    expect(response.body).toEqual(expected);
  });

  it("returns 409 PROVIDER_NOT_CONFIGURED for microsoft on a Google-only deployment", async () => {
    CONFIG.MICROSOFT_CLIENT_ID = undefined;
    CONFIG.MICROSOFT_CLIENT_SECRET = undefined;
    const { user } = await UtilDriver.setupTestUser();
    const beginConnection = spyOn(syncServiceFactory, "getSyncServiceClient");

    const response = await baseDriver
      .getServer()
      .post("/api/auth/connections/begin")
      .use(sessionFor(user._id.toString()))
      .send({ provider: "microsoft" })
      .expect(Status.CONFLICT);

    expect(response.body.code).toBe("PROVIDER_NOT_CONFIGURED");
    expect(response.body.message).toContain("Microsoft");
    expect(beginConnection).not.toHaveBeenCalled();
  });

  it("returns 401 without a session on credential connect", async () => {
    const response = await baseDriver
      .getServer()
      .post("/api/auth/connections/credential")
      .send({
        provider: "apple",
        envelope: {
          iv: "aGVsbG8=",
          ciphertext: "Y2lwaGVydGV4dA==",
          authTag: "dGFn",
        },
      })
      .expect(Status.UNAUTHORIZED);

    expect(response.body.message).toBeDefined();
  });

  it("connects Apple credentials through sync on the happy path", async () => {
    CONFIG.SYNC_CREDENTIAL_ENCRYPTION_KEY = "test-credential-key";
    const { user } = await UtilDriver.setupTestUser();
    const connectionId = "507f1f77bcf86cd799439011";
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      createCredentialConnection: async () => ({
        ok: true,
        value: { connectionId },
        correlationId: "corr-credential",
      }),
    } as never);

    const response = await postCredential(
      user._id.toString(),
      "user@icloud.com",
      "app-specific-password",
    ).expect(Status.OK);

    expect(response.body).toEqual({
      kind: "connected",
      connectionId,
    });
  });

  it("maps sync invalidCredential to 400 with the exact user-facing copy", async () => {
    CONFIG.SYNC_CREDENTIAL_ENCRYPTION_KEY = "test-credential-key";
    const { user } = await UtilDriver.setupTestUser();
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      createCredentialConnection: async () => ({
        ok: false,
        error: {
          kind: "unauthorized",
          status: 401,
          correlationId: "corr-invalid",
        },
      }),
    } as never);

    const response = await postCredential(
      user._id.toString(),
      "user@icloud.com",
      "wrong-password",
    ).expect(Status.BAD_REQUEST);

    expect(response.body.message).toBe(INVALID_APPLE_CREDENTIAL_MESSAGE);
    expect(response.body.code).toBe("INVALID_CREDENTIAL");
  });

  it("returns 503 when sync throttles credential validation", async () => {
    CONFIG.SYNC_CREDENTIAL_ENCRYPTION_KEY = "test-credential-key";
    const { user } = await UtilDriver.setupTestUser();
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      createCredentialConnection: async () => ({
        ok: false,
        error: {
          kind: "unavailable",
          status: 503,
          correlationId: "corr-throttle",
        },
      }),
    } as never);

    const response = await postCredential(
      user._id.toString(),
      "user@icloud.com",
      "app-specific-password",
    ).expect(Status.SERVICE_UNAVAILABLE);

    expect(response.body.message).toBe(INVALID_APPLE_CREDENTIAL_MESSAGE);
  });

  it("returns 409 when Apple connect is not configured", async () => {
    CONFIG.SYNC_CREDENTIAL_ENCRYPTION_KEY = undefined;
    const { user } = await UtilDriver.setupTestUser();
    const createCredentialConnection = spyOn(
      syncServiceFactory,
      "getSyncServiceClient",
    );

    const response = await postCredential(
      user._id.toString(),
      "user@icloud.com",
      "app-specific-password",
    ).expect(Status.CONFLICT);

    expect(response.body.code).toBe("PROVIDER_NOT_CONFIGURED");
    expect(createCredentialConnection).not.toHaveBeenCalled();
  });

  it("rate-limits credential connect to five attempts per fifteen minutes", async () => {
    CONFIG.SYNC_CREDENTIAL_ENCRYPTION_KEY = "test-credential-key";
    const { user } = await UtilDriver.setupTestUser();
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      createCredentialConnection: async () => ({
        ok: false,
        error: {
          kind: "unauthorized",
          status: 401,
          correlationId: "corr-rate-limit",
        },
      }),
    } as never);

    for (let i = 0; i < 5; i += 1) {
      await postCredential(
        user._id.toString(),
        "user@icloud.com",
        `wrong-password-${i}`,
      ).expect(Status.BAD_REQUEST);
    }

    const throttled = await postCredential(
      user._id.toString(),
      "user@icloud.com",
      "wrong-password-final",
    );
    expect(throttled.status).toBe(429);
  });
});
