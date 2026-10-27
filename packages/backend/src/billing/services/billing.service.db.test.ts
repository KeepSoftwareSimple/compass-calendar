import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { mockEnv } from "@backend/__tests__/helpers/mock.setup";
import billingService from "@backend/billing/services/billing.service";
import mongoService from "@backend/common/services/mongo.service";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

const stripeEnforcing = {
  STRIPE_SECRET_KEY: "rk_test_123",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_ID: "price_test",
  STRIPE_PUBLISHABLE_KEY: "pk_test_123",
  BILLING_ENFORCEMENT: true,
};

describe("BillingService (db)", () => {
  beforeAll(async () => {
    await setupTestDb(import.meta.url);
  });
  beforeEach(cleanupCollections);
  afterAll(cleanupTestDb);

  it("throws when the user does not exist", async () => {
    await expect(
      billingService.getStatus(mongoService.objectId().toString()),
    ).rejects.toThrow("User not found");
  });

  it("reports compasscaltest.invalid signups as awaiting_checkout when not journey-tagged", async () => {
    using _env = mockEnv(stripeEnforcing);
    const userId = mongoService.objectId();
    await mongoService.user.insertOne({
      _id: userId,
      email: `agent.trial.${Date.now()}@compasscaltest.invalid`,
      name: "Staging Trial",
      firstName: "Staging",
      lastName: "Trial",
      locale: "en",
    });

    const status = await billingService.getStatus(userId.toString());

    expect(status.subscriptionStatus).toBe("awaiting_checkout");
    expect(status.isReadOnly).toBe(true);
  });

  it("reports synthetic journey accounts as active without touching stored billing", async () => {
    using _env = mockEnv({
      ...stripeEnforcing,
      SYNTHETIC_JOURNEY_EMAILS: ["runner@example.com"],
    });
    const userId = mongoService.objectId();
    await mongoService.user.insertOne({
      _id: userId,
      email: "runner+journey1@example.com",
      name: "Journey Bot",
      firstName: "Journey",
      lastName: "Bot",
      locale: "en",
      isSynthetic: true,
      billing: { subscriptionStatus: "awaiting_checkout" },
    });

    const status = await billingService.getStatus(userId.toString());

    expect(status).toEqual({
      subscriptionStatus: "active",
      trialEndsAt: null,
      isReadOnly: false,
      cancelAtPeriodEnd: false,
    });
  });

  it("reports a bypassed account as active without touching stored billing", async () => {
    using _env = mockEnv({
      ...stripeEnforcing,
      BILLING_BYPASS_EMAILS: ["qa@example.com"],
    });
    const userId = mongoService.objectId();
    await mongoService.user.insertOne({
      _id: userId,
      email: "QA@Example.com",
      name: "QA User",
      firstName: "QA",
      lastName: "User",
      locale: "en",
      billing: { subscriptionStatus: "awaiting_checkout" },
    });

    const status = await billingService.getStatus(userId.toString());

    expect(status).toEqual({
      subscriptionStatus: "active",
      trialEndsAt: null,
      isReadOnly: false,
      cancelAtPeriodEnd: false,
    });

    const stored = await mongoService.user.findOne({ _id: userId });
    expect(stored?.billing?.subscriptionStatus).toBe("awaiting_checkout");
  });

  it("ignores the bypass list where the write guard would not consult it", async () => {
    using _env = mockEnv({
      ...stripeEnforcing,
      BILLING_ENFORCEMENT: false,
      BILLING_BYPASS_EMAILS: ["qa@example.com"],
    });
    const userId = mongoService.objectId();
    await mongoService.user.insertOne({
      _id: userId,
      email: "qa@example.com",
      name: "QA User",
      firstName: "QA",
      lastName: "User",
      locale: "en",
      billing: { subscriptionStatus: "awaiting_checkout" },
    });

    const status = await billingService.getStatus(userId.toString());

    expect(status.subscriptionStatus).toBe("awaiting_checkout");
  });

  it("reports an in-window card-less local trial from stored status", async () => {
    const userId = mongoService.objectId();
    const trialEndsAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    await mongoService.user.insertOne({
      _id: userId,
      email: "local-trial@example.com",
      name: "Local Trial",
      firstName: "Local",
      lastName: "Trial",
      locale: "en",
      billing: {
        subscriptionStatus: "trialing",
        trialStartedAt: new Date(),
        trialEndsAt,
      },
    });

    const status = await billingService.getStatus(userId.toString());

    expect(status).toEqual({
      subscriptionStatus: "trialing",
      trialEndsAt: trialEndsAt.toISOString(),
      isReadOnly: false,
      cancelAtPeriodEnd: false,
    });
  });

  it("reports expired for a stale card-less local trial and persists the status", async () => {
    const userId = mongoService.objectId();
    const trialEndsAt = new Date("2026-09-22T00:00:00.000Z");
    await mongoService.user.insertOne({
      _id: userId,
      email: "stale-local@example.com",
      name: "Stale",
      firstName: "Stale",
      lastName: "Trial",
      locale: "en",
      billing: {
        subscriptionStatus: "trialing",
        trialStartedAt: new Date("2026-09-15T00:00:00.000Z"),
        trialEndsAt,
      },
    });

    const status = await billingService.getStatus(userId.toString());

    expect(status.subscriptionStatus).toBe("expired");
    expect(status.isReadOnly).toBe(true);
    const stored = await mongoService.user.findOne({ _id: userId });
    expect(stored?.billing?.subscriptionStatus).toBe("expired");
  });
});
