import { type Schema_UserBilling } from "@core/types/user.types";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { mockEnv } from "@backend/__tests__/helpers/mock.setup";
import { assertBillingAllowsWrites } from "@backend/billing/billing.guard";
import mongoService from "@backend/common/services/mongo.service";
import { EventMutationException } from "@backend/event/event.error";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

const stripeConfigured = {
  STRIPE_SECRET_KEY: "rk_test_123",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_ID: "price_test",
  STRIPE_PUBLISHABLE_KEY: "pk_test_123",
  BILLING_ENFORCEMENT: true,
};

const insertUser = async (billing?: Schema_UserBilling, email?: string) => {
  const userId = mongoService.objectId();
  await mongoService.user.insertOne({
    _id: userId,
    email: email ?? `${userId.toString()}@example.com`,
    name: "Guard User",
    firstName: "Guard",
    lastName: "User",
    locale: "en",
    ...(billing ? { billing } : {}),
  });
  return userId.toString();
};

describe("assertBillingAllowsWrites", () => {
  beforeAll(async () => {
    await setupTestDb(import.meta.url);
  });
  beforeEach(cleanupCollections);
  afterAll(cleanupTestDb);

  it("no-ops when Stripe is unconfigured", async () => {
    using _env = mockEnv({ BILLING_ENFORCEMENT: true });
    const userId = await insertUser({
      subscriptionStatus: "awaiting_checkout",
    });
    await expect(assertBillingAllowsWrites(userId)).resolves.toBeUndefined();
  });

  it("no-ops when enforcement is paused, even with Stripe fully configured", async () => {
    using _env = mockEnv({
      STRIPE_SECRET_KEY: "rk_test_123",
      STRIPE_WEBHOOK_SECRET: "whsec_test",
      STRIPE_PRICE_ID: "price_test",
      STRIPE_PUBLISHABLE_KEY: "pk_test_123",
      BILLING_ENFORCEMENT: false,
    });
    const userId = await insertUser({
      subscriptionStatus: "awaiting_checkout",
    });
    await expect(assertBillingAllowsWrites(userId)).resolves.toBeUndefined();
  });

  it("allows active and past_due writes when Stripe is configured", async () => {
    using _env = mockEnv(stripeConfigured);
    const active = await insertUser({
      subscriptionStatus: "active",
      stripeSubscriptionId: "sub_a",
    });
    const pastDue = await insertUser({
      subscriptionStatus: "past_due",
      stripeSubscriptionId: "sub_p",
    });
    await expect(assertBillingAllowsWrites(active)).resolves.toBeUndefined();
    await expect(assertBillingAllowsWrites(pastDue)).resolves.toBeUndefined();
  });

  it("rejects awaiting_checkout and expired with BILLING_REQUIRED", async () => {
    using _env = mockEnv(stripeConfigured);
    const awaiting = await insertUser({
      subscriptionStatus: "awaiting_checkout",
    });
    const expired = await insertUser({ subscriptionStatus: "expired" });

    await expect(assertBillingAllowsWrites(awaiting)).rejects.toBeInstanceOf(
      EventMutationException,
    );
    await expect(assertBillingAllowsWrites(expired)).rejects.toMatchObject({
      mutationCode: "BILLING_REQUIRED",
    });
  });

  it("rejects missing billing and a local trialing record with no trialEndsAt", async () => {
    using _env = mockEnv(stripeConfigured);
    const missing = await insertUser();
    const localTrialNoEnd = await insertUser({
      subscriptionStatus: "trialing",
      trialStartedAt: new Date("2026-08-06T00:00:00.000Z"),
    });

    await expect(assertBillingAllowsWrites(missing)).rejects.toMatchObject({
      mutationCode: "BILLING_REQUIRED",
    });
    await expect(
      assertBillingAllowsWrites(localTrialNoEnd),
    ).rejects.toMatchObject({
      mutationCode: "BILLING_REQUIRED",
    });
  });

  it("allows writes on a local trial that has not expired", async () => {
    using _env = mockEnv(stripeConfigured);
    const localTrial = await insertUser({
      subscriptionStatus: "trialing",
      trialStartedAt: new Date("2026-08-06T00:00:00.000Z"),
      trialEndsAt: new Date("2099-01-01T00:00:00.000Z"),
    });

    await expect(
      assertBillingAllowsWrites(localTrial),
    ).resolves.toBeUndefined();
  });

  it("rejects an expired local trial with BILLING_REQUIRED", async () => {
    using _env = mockEnv(stripeConfigured);
    const expired = await insertUser({
      subscriptionStatus: "trialing",
      trialStartedAt: new Date("2026-07-18T00:00:00.000Z"),
      trialEndsAt: new Date("2026-08-01T00:00:00.000Z"),
    });

    await expect(assertBillingAllowsWrites(expired)).rejects.toMatchObject({
      mutationCode: "BILLING_REQUIRED",
    });
  });

  it("allows a bypassed account that would otherwise be gated", async () => {
    using _env = mockEnv({
      ...stripeConfigured,
      BILLING_BYPASS_EMAILS: ["qa@example.com"],
    });
    const bypassed = await insertUser(
      { subscriptionStatus: "awaiting_checkout" },
      "qa@example.com",
    );

    await expect(assertBillingAllowsWrites(bypassed)).resolves.toBeUndefined();
  });

  it("still rejects an account that is not on the bypass list", async () => {
    using _env = mockEnv({
      ...stripeConfigured,
      BILLING_BYPASS_EMAILS: ["qa@example.com"],
    });
    const other = await insertUser(
      { subscriptionStatus: "awaiting_checkout" },
      "someone-else@example.com",
    );

    await expect(assertBillingAllowsWrites(other)).rejects.toMatchObject({
      mutationCode: "BILLING_REQUIRED",
    });
  });

  it("matches bypass emails ignoring case and surrounding whitespace", async () => {
    using _env = mockEnv({
      ...stripeConfigured,
      BILLING_BYPASS_EMAILS: ["  QA@Example.com "],
    });
    const bypassed = await insertUser(
      { subscriptionStatus: "expired" },
      "qa@example.com",
    );

    await expect(assertBillingAllowsWrites(bypassed)).resolves.toBeUndefined();
  });

  it("leaves the stored billing state untouched for a bypassed account", async () => {
    using _env = mockEnv({
      ...stripeConfigured,
      BILLING_BYPASS_EMAILS: ["qa@example.com"],
    });
    const bypassed = await insertUser(
      { subscriptionStatus: "awaiting_checkout" },
      "qa@example.com",
    );

    await assertBillingAllowsWrites(bypassed);

    const stored = await mongoService.user.findOne({
      _id: mongoService.objectId(bypassed),
    });
    expect(stored?.billing?.subscriptionStatus).toBe("awaiting_checkout");
  });
});
