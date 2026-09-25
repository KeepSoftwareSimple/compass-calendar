import { type Request, type Response } from "express";
import { NodeEnv } from "@core/constants/core.constants";
import { type AppConfig, AppConfigSchema } from "@core/types/config.types";
import { CONFIG } from "@backend/common/constants/config.constants";
import configController, { buildAppConfig } from "./config.controller";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

// Capture what the controller writes via res.json without a real HTTP round-trip.
const invokeGet = (): AppConfig => {
  let captured: AppConfig | undefined;
  const res = {
    json: (body: AppConfig) => {
      captured = body;
    },
  } as unknown as Response;

  configController.get({} as Request<never, AppConfig, never, never>, res);

  if (!captured) {
    throw new Error("config controller did not respond");
  }

  return captured;
};

describe("ConfigController.get sync cutover posture", () => {
  const originals = {
    cloudMutationMode: CONFIG.SYNC_CLOUD_MUTATION_MODE,
    execution: CONFIG.SYNC_EXECUTION,
  };

  afterEach(() => {
    CONFIG.SYNC_CLOUD_MUTATION_MODE = originals.cloudMutationMode;
    CONFIG.SYNC_EXECUTION = originals.execution;
  });

  it("exposes the two global cutover knobs", () => {
    CONFIG.SYNC_CLOUD_MUTATION_MODE = "maintenance";
    CONFIG.SYNC_EXECUTION = "passive";

    const config = buildAppConfig(CONFIG);
    expect(config.sync).toEqual({
      cloudMutationMode: "maintenance",
      execution: "passive",
    });
    expect(config.billing).toEqual({
      isConfigured: false,
      enforcement: false,
      trialLengthDays: 7,
      publishableKey: null,
    });
  });
});

describe("ConfigController.get billing enforcement", () => {
  const original = CONFIG.BILLING_ENFORCEMENT;

  afterEach(() => {
    CONFIG.BILLING_ENFORCEMENT = original;
  });

  it("defaults to paused", () => {
    CONFIG.BILLING_ENFORCEMENT = false;
    expect(buildAppConfig(CONFIG).billing.enforcement).toBe(false);
  });

  it("reports true once the operator enables it", () => {
    CONFIG.BILLING_ENFORCEMENT = true;
    expect(buildAppConfig(CONFIG).billing.enforcement).toBe(true);
  });
});

describe("ConfigController.get billing publishableKey", () => {
  const originals = {
    secretKey: CONFIG.STRIPE_SECRET_KEY,
    webhookSecret: CONFIG.STRIPE_WEBHOOK_SECRET,
    priceId: CONFIG.STRIPE_PRICE_ID,
    publishableKey: CONFIG.STRIPE_PUBLISHABLE_KEY,
  };

  afterEach(() => {
    CONFIG.STRIPE_SECRET_KEY = originals.secretKey;
    CONFIG.STRIPE_WEBHOOK_SECRET = originals.webhookSecret;
    CONFIG.STRIPE_PRICE_ID = originals.priceId;
    CONFIG.STRIPE_PUBLISHABLE_KEY = originals.publishableKey;
  });

  it("returns null when Stripe is not configured", () => {
    CONFIG.STRIPE_SECRET_KEY = undefined;
    CONFIG.STRIPE_WEBHOOK_SECRET = undefined;
    CONFIG.STRIPE_PRICE_ID = undefined;
    CONFIG.STRIPE_PUBLISHABLE_KEY = undefined;

    expect(buildAppConfig(CONFIG).billing.publishableKey).toBeNull();
    expect(buildAppConfig(CONFIG).billing.isConfigured).toBe(false);
  });

  it("returns the configured key when Stripe is fully configured", () => {
    CONFIG.STRIPE_SECRET_KEY = "rk_test_123";
    CONFIG.STRIPE_WEBHOOK_SECRET = "whsec_test";
    CONFIG.STRIPE_PRICE_ID = "price_test";
    CONFIG.STRIPE_PUBLISHABLE_KEY = "pk_test_123";

    expect(buildAppConfig(CONFIG).billing.publishableKey).toBe("pk_test_123");
    expect(buildAppConfig(CONFIG).billing.isConfigured).toBe(true);
  });
});

describe("ConfigController.get parsed payload", () => {
  afterEach(() => {
    mock.restore();
  });

  it("parses AppConfigSchema once across two requests", () => {
    const parse = spyOn(AppConfigSchema, "parse");

    const first = invokeGet();
    const second = invokeGet();

    expect(first).toBe(second);
    expect(parse).not.toHaveBeenCalled();
  });
});

describe("buildAppConfig provider flags", () => {
  it("reports Google unavailable when credentials are absent", () => {
    const originalClientId = CONFIG.GOOGLE_CLIENT_ID;
    const originalClientSecret = CONFIG.GOOGLE_CLIENT_SECRET;
    CONFIG.GOOGLE_CLIENT_ID = undefined;
    CONFIG.GOOGLE_CLIENT_SECRET = undefined;

    try {
      const config = buildAppConfig(CONFIG);
      expect(config.providers.google).toEqual({
        signIn: false,
        connect: false,
      });
    } finally {
      CONFIG.GOOGLE_CLIENT_ID = originalClientId;
      CONFIG.GOOGLE_CLIENT_SECRET = originalClientSecret;
    }
  });

  it("returns providers.google.connect true on a Google-only config", () => {
    const originals = {
      googleId: CONFIG.GOOGLE_CLIENT_ID,
      googleSecret: CONFIG.GOOGLE_CLIENT_SECRET,
      microsoftId: CONFIG.MICROSOFT_CLIENT_ID,
      microsoftSecret: CONFIG.MICROSOFT_CLIENT_SECRET,
    };
    CONFIG.GOOGLE_CLIENT_ID = "client-id";
    CONFIG.GOOGLE_CLIENT_SECRET = "client-secret";
    CONFIG.MICROSOFT_CLIENT_ID = undefined;
    CONFIG.MICROSOFT_CLIENT_SECRET = undefined;

    try {
      const config = buildAppConfig(CONFIG);
      expect(config.providers.google.connect).toBe(true);
      expect(config.providers.microsoft.connect).toBe(false);
    } finally {
      CONFIG.GOOGLE_CLIENT_ID = originals.googleId;
      CONFIG.GOOGLE_CLIENT_SECRET = originals.googleSecret;
      CONFIG.MICROSOFT_CLIENT_ID = originals.microsoftId;
      CONFIG.MICROSOFT_CLIENT_SECRET = originals.microsoftSecret;
    }
  });

  it("normalizes the deployed version", () => {
    const original = CONFIG.VERSION;
    CONFIG.VERSION = "v9.8.7";
    try {
      expect(buildAppConfig(CONFIG).version).toBe("9.8.7");
    } finally {
      CONFIG.VERSION = original;
    }
  });

  it("offers Microsoft in production when credentials are configured", () => {
    const originals = {
      nodeEnv: CONFIG.NODE_ENV,
      microsoftId: CONFIG.MICROSOFT_CLIENT_ID,
      microsoftSecret: CONFIG.MICROSOFT_CLIENT_SECRET,
    };
    CONFIG.NODE_ENV = NodeEnv.Production;
    CONFIG.MICROSOFT_CLIENT_ID = "ms-client-id";
    CONFIG.MICROSOFT_CLIENT_SECRET = "ms-client-secret";

    try {
      expect(buildAppConfig(CONFIG).providers.microsoft).toEqual({
        signIn: true,
        connect: true,
      });
    } finally {
      CONFIG.NODE_ENV = originals.nodeEnv;
      CONFIG.MICROSOFT_CLIENT_ID = originals.microsoftId;
      CONFIG.MICROSOFT_CLIENT_SECRET = originals.microsoftSecret;
    }
  });

  it("hides Apple in production even when the credential key is set", () => {
    const originals = {
      nodeEnv: CONFIG.NODE_ENV,
      encryptionKey: CONFIG.SYNC_CREDENTIAL_ENCRYPTION_KEY,
    };
    CONFIG.NODE_ENV = NodeEnv.Production;
    CONFIG.SYNC_CREDENTIAL_ENCRYPTION_KEY = "a".repeat(44);

    try {
      expect(buildAppConfig(CONFIG).providers.apple).toEqual({
        signIn: false,
        connect: false,
      });
    } finally {
      CONFIG.NODE_ENV = originals.nodeEnv;
      CONFIG.SYNC_CREDENTIAL_ENCRYPTION_KEY = originals.encryptionKey;
    }
  });

  it("offers Apple connect in staging when the credential key is set", () => {
    const originals = {
      nodeEnv: CONFIG.NODE_ENV,
      encryptionKey: CONFIG.SYNC_CREDENTIAL_ENCRYPTION_KEY,
    };
    CONFIG.NODE_ENV = NodeEnv.Staging;
    CONFIG.SYNC_CREDENTIAL_ENCRYPTION_KEY = "a".repeat(44);

    try {
      expect(buildAppConfig(CONFIG).providers.apple.connect).toBe(true);
    } finally {
      CONFIG.NODE_ENV = originals.nodeEnv;
      CONFIG.SYNC_CREDENTIAL_ENCRYPTION_KEY = originals.encryptionKey;
    }
  });

  it("offers Microsoft in staging when credentials are configured", () => {
    const originals = {
      nodeEnv: CONFIG.NODE_ENV,
      microsoftId: CONFIG.MICROSOFT_CLIENT_ID,
      microsoftSecret: CONFIG.MICROSOFT_CLIENT_SECRET,
    };
    CONFIG.NODE_ENV = NodeEnv.Staging;
    CONFIG.MICROSOFT_CLIENT_ID = "ms-client-id";
    CONFIG.MICROSOFT_CLIENT_SECRET = "ms-client-secret";

    try {
      expect(buildAppConfig(CONFIG).providers.microsoft).toEqual({
        signIn: true,
        connect: true,
      });
    } finally {
      CONFIG.NODE_ENV = originals.nodeEnv;
      CONFIG.MICROSOFT_CLIENT_ID = originals.microsoftId;
      CONFIG.MICROSOFT_CLIENT_SECRET = originals.microsoftSecret;
    }
  });
});
