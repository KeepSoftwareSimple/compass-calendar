import { type Request, type Response } from "express";
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
