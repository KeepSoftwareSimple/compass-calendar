import { type CompassConfig } from "@core/config/compass.config";
import {
  CREDENTIAL_ENCRYPTION_KEY_REQUIRED_MESSAGE,
  parseSyncConfig,
  SyncConfigSchema,
} from "@sync/config/sync.config";

const VALID_ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

const baseSyncSection = () => ({
  mongoUri: "mongodb+srv://compass_sync:pw@cluster/compass_sync",
  internalAuthToken: "internal-token",
  callbackBaseUrl: "https://staging.compasscalendar.com",
});

const compassConfigWithSync = (
  syncOverrides: Record<string, unknown> = {},
): CompassConfig =>
  ({
    runtime: { nodeEnv: "staging", timezone: "Etc/UTC" },
    sync: { ...baseSyncSection(), ...syncOverrides },
  }) as unknown as CompassConfig;

describe("Sync service configuration", () => {
  describe("SyncConfigSchema defaults", () => {
    it("defaults execution to passive when omitted (safety default)", () => {
      const config = parseSyncConfig(compassConfigWithSync());
      expect(config.EXECUTION).toBe("passive");
    });

    it("defaults the port and concurrency when omitted", () => {
      const config = parseSyncConfig(compassConfigWithSync());
      expect(config.PORT).toBe(3010);
      expect(config.MAX_CONCURRENCY).toBe(4);
      expect(config.RESERVED_PULL_LANES).toBe(1);
    });

    it("coerces a yaml numeric string reservedPullLanes to a number", () => {
      const config = parseSyncConfig(
        compassConfigWithSync({ reservedPullLanes: "2" }),
      );
      expect(config.RESERVED_PULL_LANES).toBe(2);
    });

    it("accepts an explicit active execution mode", () => {
      const config = parseSyncConfig(
        compassConfigWithSync({ execution: "active" }),
      );
      expect(config.EXECUTION).toBe("active");
    });

    it("coerces a yaml numeric string port to a number", () => {
      const config = parseSyncConfig(compassConfigWithSync({ port: "4010" }));
      expect(config.PORT).toBe(4010);
    });

    it("defaults the least-privilege check off when omitted", () => {
      const config = parseSyncConfig(compassConfigWithSync());
      expect(config.ENFORCE_LEAST_PRIVILEGE).toBe(false);
    });

    it("accepts a yaml boolean for the least-privilege flag", () => {
      const config = parseSyncConfig(
        compassConfigWithSync({ enforceLeastPrivilege: true }),
      );
      expect(config.ENFORCE_LEAST_PRIVILEGE).toBe(true);
    });

    it("coerces the string 'true' for the least-privilege flag", () => {
      const config = parseSyncConfig(
        compassConfigWithSync({ enforceLeastPrivilege: "true" }),
      );
      expect(config.ENFORCE_LEAST_PRIVILEGE).toBe(true);
    });
  });

  describe("Google credentials (shared google config section)", () => {
    const withGoogle = (google: Record<string, unknown> | undefined) =>
      ({
        runtime: { nodeEnv: "staging", timezone: "Etc/UTC" },
        sync: baseSyncSection(),
        google,
      }) as unknown as CompassConfig;

    it("leaves the Google client unset when the google section is absent", () => {
      const config = parseSyncConfig(withGoogle(undefined));
      expect(config.GOOGLE_CLIENT_ID).toBeUndefined();
      expect(config.GOOGLE_CLIENT_SECRET).toBeUndefined();
    });

    it("reads the Google client id and secret from the google section", () => {
      const config = parseSyncConfig({
        ...withGoogle({
          clientId: "id.apps.googleusercontent.com",
          clientSecret: "secret",
        }),
        sync: {
          ...baseSyncSection(),
          credentialEncryptionKey: VALID_ENCRYPTION_KEY,
        },
      } as unknown as CompassConfig);
      expect(config.GOOGLE_CLIENT_ID).toBe("id.apps.googleusercontent.com");
      expect(config.GOOGLE_CLIENT_SECRET).toBe("secret");
    });

    it("treats an empty-string placeholder as unset", () => {
      const config = parseSyncConfig(
        withGoogle({ clientId: "", clientSecret: "" }),
      );
      expect(config.GOOGLE_CLIENT_ID).toBeUndefined();
      expect(config.GOOGLE_CLIENT_SECRET).toBeUndefined();
    });
  });

  describe("Microsoft credentials and encryption key (read-only)", () => {
    it("leaves microsoft and the encryption key unset when absent", () => {
      const config = parseSyncConfig(compassConfigWithSync());
      expect(config.MICROSOFT_CLIENT_ID).toBeUndefined();
      expect(config.MICROSOFT_CLIENT_SECRET).toBeUndefined();
      expect(config.CREDENTIAL_ENCRYPTION_KEY).toBeUndefined();
    });

    it("reads microsoft client credentials from the microsoft section", () => {
      const config = parseSyncConfig({
        runtime: { nodeEnv: "staging", timezone: "Etc/UTC" },
        sync: {
          ...baseSyncSection(),
          credentialEncryptionKey: VALID_ENCRYPTION_KEY,
        },
        microsoft: { clientId: "ms-id", clientSecret: "ms-secret" },
      } as unknown as CompassConfig);
      expect(config.MICROSOFT_CLIENT_ID).toBe("ms-id");
      expect(config.MICROSOFT_CLIENT_SECRET).toBe("ms-secret");
    });

    it("reads credentialEncryptionKey from the sync section", () => {
      const config = parseSyncConfig(
        compassConfigWithSync({
          credentialEncryptionKey: VALID_ENCRYPTION_KEY,
        }),
      );
      expect(config.CREDENTIAL_ENCRYPTION_KEY).toBe(VALID_ENCRYPTION_KEY);
    });

    it("defaults Apple reconcile cadence and sweep sizing", () => {
      const config = parseSyncConfig(compassConfigWithSync());
      expect(config.reconcileStaleAfterMsByKind.apple).toBe(60_000);
      expect(config.reconcileSweepIntervalMsByKind.apple).toBe(30_000);
      expect(config.reconcileSweepLimitByKind.apple).toBe(500);
    });
  });

  describe("credential encryption key when a provider is configured", () => {
    it("rejects a Google client id without the encryption key", () => {
      expect(() =>
        parseSyncConfig({
          runtime: { nodeEnv: "staging", timezone: "Etc/UTC" },
          sync: baseSyncSection(),
          google: {
            clientId: "id.apps.googleusercontent.com",
            clientSecret: "secret",
          },
        } as unknown as CompassConfig),
      ).toThrow(CREDENTIAL_ENCRYPTION_KEY_REQUIRED_MESSAGE);
    });

    it("parses a Google client id when the encryption key is set", () => {
      const config = parseSyncConfig({
        runtime: { nodeEnv: "staging", timezone: "Etc/UTC" },
        sync: {
          ...baseSyncSection(),
          credentialEncryptionKey: VALID_ENCRYPTION_KEY,
        },
        google: {
          clientId: "id.apps.googleusercontent.com",
          clientSecret: "secret",
        },
      } as unknown as CompassConfig);
      expect(config.GOOGLE_CLIENT_ID).toBe("id.apps.googleusercontent.com");
      expect(config.CREDENTIAL_ENCRYPTION_KEY).toBe(VALID_ENCRYPTION_KEY);
    });

    it("parses a config with no providers and no encryption key", () => {
      const config = parseSyncConfig(compassConfigWithSync());
      expect(config.GOOGLE_CLIENT_ID).toBeUndefined();
      expect(config.MICROSOFT_CLIENT_ID).toBeUndefined();
      expect(config.CREDENTIAL_ENCRYPTION_KEY).toBeUndefined();
    });
  });

  describe("required fields", () => {
    it("throws a clear error when the sync section is absent", () => {
      const config = { runtime: { nodeEnv: "staging", timezone: "Etc/UTC" } };
      expect(() => parseSyncConfig(config as unknown as CompassConfig)).toThrow(
        /sync.*section/i,
      );
    });

    it.each([
      "mongoUri",
      "internalAuthToken",
      "callbackBaseUrl",
    ])("rejects a config missing %s", (field) => {
      const section = baseSyncSection() as Record<string, unknown>;
      delete section[field];
      const config = {
        runtime: { nodeEnv: "staging", timezone: "Etc/UTC" },
        sync: section,
      };
      expect(() =>
        parseSyncConfig(config as unknown as CompassConfig),
      ).toThrow();
    });

    it("rejects an empty mongoUri", () => {
      expect(() =>
        parseSyncConfig(compassConfigWithSync({ mongoUri: "   " })),
      ).toThrow();
    });
  });

  describe("invalid values", () => {
    it("rejects a non-URL callbackBaseUrl", () => {
      expect(() =>
        parseSyncConfig(
          compassConfigWithSync({ callbackBaseUrl: "not-a-url" }),
        ),
      ).toThrow();
    });

    it("rejects an unknown execution mode", () => {
      expect(() =>
        parseSyncConfig(compassConfigWithSync({ execution: "paused" })),
      ).toThrow();
    });

    it("rejects a non-positive port", () => {
      expect(() =>
        parseSyncConfig(compassConfigWithSync({ port: 0 })),
      ).toThrow();
    });

    it("rejects a fractional concurrency", () => {
      expect(() =>
        parseSyncConfig(compassConfigWithSync({ maxConcurrency: 2.5 })),
      ).toThrow();
    });

    it("rejects reservedPullLanes equal to maxConcurrency", () => {
      expect(() =>
        parseSyncConfig(
          compassConfigWithSync({ maxConcurrency: 2, reservedPullLanes: 2 }),
        ),
      ).toThrow(/reservedPullLanes.*maxConcurrency/i);
    });

    it("rejects reservedPullLanes greater than maxConcurrency", () => {
      expect(() =>
        parseSyncConfig(
          compassConfigWithSync({ maxConcurrency: 2, reservedPullLanes: 3 }),
        ),
      ).toThrow();
    });

    it("accepts reservedPullLanes strictly below maxConcurrency", () => {
      const config = parseSyncConfig(
        compassConfigWithSync({ maxConcurrency: 2, reservedPullLanes: 1 }),
      );
      expect(config.RESERVED_PULL_LANES).toBe(1);
    });
  });

  describe("unknown fields", () => {
    it("rejects an unknown top-level config field", () => {
      const result = SyncConfigSchema.safeParse({
        NODE_ENV: "test",
        MONGO_URI: "mongodb://localhost/compass_sync",
        INTERNAL_AUTH_TOKEN: "t",
        CALLBACK_BASE_URL: "http://localhost:3010",
        SUPERTOKENS_KEY: "leak",
      });
      expect(result.success).toBe(false);
    });
  });
});
