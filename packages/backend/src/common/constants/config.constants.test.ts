import { type CompassConfig } from "@core/config/compass.config";
import {
  parseConfigFromEnv,
  parseRawConfig,
} from "@backend/common/constants/config.constants";
import {
  isBillingBypassed,
  isGoogleConfigured,
  isMicrosoftConfigured,
  isOAuthConnectConfigured,
  isStripeConfigured,
} from "@backend/common/constants/config.util";
import { describe, expect, it } from "bun:test";

// A minimal valid compass config file, mirroring the required fields
// parseRawConfig reads. Sync is required (every deployment delegates to it),
// so the base fixture always includes it.
const baseRawConfig: CompassConfig = {
  web: { url: "http://localhost:9080" },
  backend: {
    apiUrl: "http://localhost:3000/api",
    compassToken: "compass-token",
  },
  runtime: { nodeEnv: "development", timezone: "Etc/UTC" },
  mongo: { uri: "mongodb://localhost:27017/compass" },
  supertokens: { uri: "http://localhost:3567", key: "supertokens-key" },
  sync: {
    mongoUri: "mongodb://localhost:27017/compass_sync",
    internalAuthToken: "sync-internal-secret",
    callbackBaseUrl: "http://localhost:3010",
    serviceUrl: "http://localhost:3010",
  },
};

const validEnv = {
  BASEURL: "http://localhost:3000/api",
  CORS: "http://localhost:9080",
  FRONTEND_URL: "http://localhost:9080",
  MONGO_URI: "mongodb://localhost:27017/compass",
  NODE_ENV: "development",
  PORT: "3000",
  SUPERTOKENS_KEY: "supertokens-key",
  SUPERTOKENS_URI: "http://localhost:3567",
  TOKEN_COMPASS_SYNC: "sync-token",
  TZ: "Etc/UTC",
  SYNC_SERVICE_URL: "http://localhost:3010",
  SYNC_INTERNAL_AUTH_TOKEN: "sync-internal-secret",
};

describe("config.constants", () => {
  it("parses backend env without Google configuration", () => {
    const env = parseConfigFromEnv(validEnv);

    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.GOOGLE_CLIENT_SECRET).toBeUndefined();
    expect(isGoogleConfigured(env)).toBe(false);
  });

  it("parses backend env without Stripe configuration", () => {
    const env = parseConfigFromEnv(validEnv);

    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
    expect(env.STRIPE_PUBLISHABLE_KEY).toBeUndefined();
    expect(isStripeConfigured(env)).toBe(false);
  });

  const stripeFour = {
    STRIPE_SECRET_KEY: "rk_test_123",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    STRIPE_PRICE_ID: "price_test",
    STRIPE_PUBLISHABLE_KEY: "pk_test_123",
  };

  it("rejects any three of the four Stripe values", () => {
    const missingOne: Array<keyof typeof stripeFour> = [
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRICE_ID",
      "STRIPE_PUBLISHABLE_KEY",
    ];

    for (const omitted of missingOne) {
      const partial: Partial<typeof stripeFour> = { ...stripeFour };
      delete partial[omitted];
      expect(() => parseConfigFromEnv({ ...validEnv, ...partial })).toThrow(
        "Stripe configuration requires secretKey, webhookSecret, priceId, and publishableKey together",
      );
    }
  });

  it("reports Stripe as configured only when all four values are present", () => {
    const env = parseConfigFromEnv({
      ...validEnv,
      ...stripeFour,
    });

    expect(isStripeConfigured(env)).toBe(true);
    expect(env.STRIPE_PUBLISHABLE_KEY).toBe("pk_test_123");
  });

  it("trims Stripe values from env and compass.yaml", () => {
    const fromEnv = parseConfigFromEnv({
      ...validEnv,
      STRIPE_SECRET_KEY: " rk_test_123\n",
      STRIPE_WEBHOOK_SECRET: " whsec_test ",
      STRIPE_PRICE_ID: "price_test\n",
      STRIPE_PUBLISHABLE_KEY: " pk_test_123\n",
    });
    expect(fromEnv.STRIPE_PRICE_ID).toBe("price_test");
    expect(fromEnv.STRIPE_SECRET_KEY).toBe("rk_test_123");
    expect(fromEnv.STRIPE_PUBLISHABLE_KEY).toBe("pk_test_123");

    const fromFile = parseRawConfig({
      ...baseRawConfig,
      stripe: {
        secretKey: " sk_test_abc ",
        webhookSecret: "whsec_file",
        priceId: " price_file\n",
        publishableKey: " pk_file\n",
      },
    });
    expect(fromFile.STRIPE_PRICE_ID).toBe("price_file");
    expect(fromFile.STRIPE_SECRET_KEY).toBe("sk_test_abc");
    expect(fromFile.STRIPE_PUBLISHABLE_KEY).toBe("pk_file");
  });

  it("rejects partially configured Google credentials", () => {
    expect(() =>
      parseConfigFromEnv({
        ...validEnv,
        GOOGLE_CLIENT_ID: "client-id",
      }),
    ).toThrow("Google configuration requires both client ID and secret");

    expect(() =>
      parseConfigFromEnv({
        ...validEnv,
        GOOGLE_CLIENT_SECRET: "client-secret",
      }),
    ).toThrow("Google configuration requires both client ID and secret");
  });

  it("reports Google as configured only when both usable credentials are present", () => {
    const env = parseConfigFromEnv({
      ...validEnv,
      BASEURL: "http://localhost:3000/api",
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
    });

    expect(isGoogleConfigured(env)).toBe(true);
  });

  it("treats absent Google credentials as not configured", () => {
    const env = parseConfigFromEnv({
      ...validEnv,
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
    });

    expect(isGoogleConfigured(env)).toBe(false);
  });

  it("rejects partially configured Microsoft credentials from env and yaml", () => {
    expect(() =>
      parseConfigFromEnv({
        ...validEnv,
        MICROSOFT_CLIENT_ID: "ms-client-id",
      }),
    ).toThrow("Microsoft configuration requires both client ID and secret");

    expect(() =>
      parseRawConfig({
        ...baseRawConfig,
        microsoft: { clientId: "ms-client-id" },
      }),
    ).toThrow("Microsoft configuration requires both client ID and secret");
  });

  it("reports OAuth connect configured per provider", () => {
    const googleOnly = parseConfigFromEnv({
      ...validEnv,
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
    });
    expect(isOAuthConnectConfigured(googleOnly, "google")).toBe(true);
    expect(isOAuthConnectConfigured(googleOnly, "microsoft")).toBe(false);
    expect(isOAuthConnectConfigured(googleOnly, "apple")).toBe(false);
  });

  it("reports Microsoft as configured only when both credentials are present", () => {
    const fromEnv = parseConfigFromEnv({
      ...validEnv,
      MICROSOFT_CLIENT_ID: "ms-client-id",
      MICROSOFT_CLIENT_SECRET: "ms-client-secret",
    });
    expect(isMicrosoftConfigured(fromEnv)).toBe(true);

    const fromFile = parseRawConfig({
      ...baseRawConfig,
      microsoft: {
        clientId: "ms-file-id",
        clientSecret: "ms-file-secret",
      },
    });
    expect(fromFile.MICROSOFT_CLIENT_ID).toBe("ms-file-id");
    expect(fromFile.MICROSOFT_CLIENT_SECRET).toBe("ms-file-secret");
    expect(isMicrosoftConfigured(fromFile)).toBe(true);
  });

  it("rejects Apple sign-in when only three of four keys are set", () => {
    const three = {
      APPLE_SIGNIN_SERVICES_ID: "com.example.siwa",
      APPLE_SIGNIN_TEAM_ID: "TEAMID12",
      APPLE_SIGNIN_KEY_ID: "KEYID123",
    };

    expect(() => parseConfigFromEnv({ ...validEnv, ...three })).toThrow(
      "Apple sign-in configuration requires servicesId, teamId, keyId, and privateKey together",
    );

    expect(() =>
      parseRawConfig({
        ...baseRawConfig,
        apple: {
          signIn: {
            servicesId: "com.example.siwa",
            teamId: "TEAMID12",
            keyId: "KEYID123",
          },
        },
      }),
    ).toThrow(
      "Apple sign-in configuration requires servicesId, teamId, keyId, and privateKey together",
    );
  });

  it("reads Apple sign-in and credentialEncryptionKey from a raw config file", () => {
    const key = Buffer.alloc(32, 9).toString("base64");
    const fromFile = parseRawConfig({
      ...baseRawConfig,
      apple: {
        signIn: {
          servicesId: "com.example.siwa",
          teamId: "TEAMID12",
          keyId: "KEYID123",
          privateKey: "dummy-private-key",
        },
      },
      sync: {
        mongoUri: baseRawConfig.sync!.mongoUri,
        internalAuthToken: baseRawConfig.sync!.internalAuthToken,
        callbackBaseUrl: baseRawConfig.sync!.callbackBaseUrl,
        serviceUrl: baseRawConfig.sync!.serviceUrl,
        credentialEncryptionKey: key,
      },
    });

    expect(fromFile.APPLE_SIGNIN_SERVICES_ID).toBe("com.example.siwa");
    expect(fromFile.APPLE_SIGNIN_TEAM_ID).toBe("TEAMID12");
    expect(fromFile.APPLE_SIGNIN_KEY_ID).toBe("KEYID123");
    expect(fromFile.APPLE_SIGNIN_PRIVATE_KEY).toBe("dummy-private-key");
    expect(fromFile.SYNC_CREDENTIAL_ENCRYPTION_KEY).toBe(key);
  });

  it("parses a fully configured Sync client", () => {
    const env = parseConfigFromEnv(validEnv);

    expect(env.SYNC_SERVICE_URL).toBe("http://localhost:3010");
    expect(env.SYNC_INTERNAL_AUTH_TOKEN).toBe("sync-internal-secret");
  });

  it("rejects env missing SYNC_SERVICE_URL", () => {
    expect(() =>
      parseConfigFromEnv({ ...validEnv, SYNC_SERVICE_URL: undefined }),
    ).toThrow();
  });

  it("rejects env missing SYNC_INTERNAL_AUTH_TOKEN", () => {
    expect(() =>
      parseConfigFromEnv({ ...validEnv, SYNC_INTERNAL_AUTH_TOKEN: undefined }),
    ).toThrow();
  });

  it("rejects blank Sync env vars rather than silently defaulting", () => {
    expect(() =>
      parseConfigFromEnv({ ...validEnv, SYNC_SERVICE_URL: "" }),
    ).toThrow();
  });

  it("rejects a raw config missing sync.serviceUrl", () => {
    // Every deployment (self-hosted or cloud) sets serviceUrl now - there is
    // no more "runs Sync without pointing the backend at it" configuration.
    expect(() =>
      parseRawConfig({
        ...baseRawConfig,
        sync: {
          mongoUri: baseRawConfig.sync!.mongoUri,
          internalAuthToken: baseRawConfig.sync!.internalAuthToken,
          callbackBaseUrl: baseRawConfig.sync!.callbackBaseUrl,
          serviceUrl: undefined,
        },
      }),
    ).toThrow();
  });

  it("reads Sync fields from a raw config file", () => {
    const env = parseRawConfig(baseRawConfig);

    expect(env.SYNC_SERVICE_URL).toBe("http://localhost:3010");
    expect(env.SYNC_INTERNAL_AUTH_TOKEN).toBe("sync-internal-secret");
  });

  it("defaults cloud mutation mode to enabled and execution to passive", () => {
    const env = parseConfigFromEnv(validEnv);

    expect(env.SYNC_CLOUD_MUTATION_MODE).toBe("enabled");
    expect(env.SYNC_EXECUTION).toBe("passive");
  });

  it("treats blank mutation-mode and execution env vars as defaults", () => {
    const env = parseConfigFromEnv({
      ...validEnv,
      SYNC_CLOUD_MUTATION_MODE: "",
      SYNC_EXECUTION: "",
    });

    expect(env.SYNC_CLOUD_MUTATION_MODE).toBe("enabled");
    expect(env.SYNC_EXECUTION).toBe("passive");
  });

  it("accepts active + enabled with a Sync client configured", () => {
    const env = parseConfigFromEnv({
      ...validEnv,
      SYNC_EXECUTION: "active",
      SYNC_CLOUD_MUTATION_MODE: "enabled",
      SYNC_SERVICE_URL: "http://localhost:3010",
      SYNC_INTERNAL_AUTH_TOKEN: "sync-internal-secret",
    });

    expect(env.SYNC_EXECUTION).toBe("active");
    expect(env.SYNC_CLOUD_MUTATION_MODE).toBe("enabled");
  });
});

describe("billing bypass allowlist", () => {
  it("defaults to empty from yaml and from env", () => {
    expect(parseRawConfig(baseRawConfig).BILLING_BYPASS_EMAILS).toEqual([]);
    expect(parseConfigFromEnv(validEnv).BILLING_BYPASS_EMAILS).toEqual([]);
  });

  it("reads a yaml list and a comma-separated env var", () => {
    const fromYaml = parseRawConfig({
      ...baseRawConfig,
      billing: { enforcement: true, bypassEmails: ["a@x.com", "b@y.com"] },
    });
    expect(fromYaml.BILLING_BYPASS_EMAILS).toEqual(["a@x.com", "b@y.com"]);

    const fromEnv = parseConfigFromEnv({
      ...validEnv,
      BILLING_BYPASS_EMAILS: "a@x.com,b@y.com",
    });
    expect(fromEnv.BILLING_BYPASS_EMAILS).toEqual(["a@x.com", "b@y.com"]);
  });

  it("drops blank entries so the startup roster count stays honest", () => {
    expect(
      parseConfigFromEnv({
        ...validEnv,
        BILLING_BYPASS_EMAILS: "qa@example.com,",
      }).BILLING_BYPASS_EMAILS,
    ).toEqual(["qa@example.com"]);

    expect(
      parseRawConfig({
        ...baseRawConfig,
        billing: { bypassEmails: ["", "  ", "qa@example.com"] },
      }).BILLING_BYPASS_EMAILS,
    ).toEqual(["qa@example.com"]);
  });

  it("matches ignoring case and surrounding whitespace", () => {
    const env = { BILLING_BYPASS_EMAILS: [" QA@Example.com ", "b@y.com"] };
    expect(isBillingBypassed(env, "qa@example.com")).toBe(true);
    expect(isBillingBypassed(env, "  QA@EXAMPLE.COM ")).toBe(true);
    expect(isBillingBypassed(env, "b@y.com")).toBe(true);
  });

  it("does not match an absent, empty, or unlisted email", () => {
    const env = { BILLING_BYPASS_EMAILS: ["qa@example.com"] };
    expect(isBillingBypassed(env, undefined)).toBe(false);
    expect(isBillingBypassed(env, "   ")).toBe(false);
    expect(isBillingBypassed(env, "other@example.com")).toBe(false);
    expect(
      isBillingBypassed({ BILLING_BYPASS_EMAILS: [] }, "qa@example.com"),
    ).toBe(false);
  });
});
