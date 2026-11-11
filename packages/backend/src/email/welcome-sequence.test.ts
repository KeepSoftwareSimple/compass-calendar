import { ObjectId } from "mongodb";
import {
  buildWelcomeEnrollmentRows,
  computeSendAt,
  findWelcomeStep,
  WELCOME_SEQUENCE,
} from "@backend/email/welcome-sequence";
import { describe, expect, it } from "bun:test";

describe("welcome sequence scheduling", () => {
  const signedUpAt = new Date("2026-01-01T12:00:00.000Z");

  it("builds one queued row per step for a new signup", () => {
    const userId = new ObjectId();
    const rows = buildWelcomeEnrollmentRows(userId, signedUpAt, "real");

    expect(rows).toHaveLength(WELCOME_SEQUENCE.length);
    expect(rows.map((row) => row.stepKey)).toEqual(
      WELCOME_SEQUENCE.map((step) => step.key),
    );
    for (const row of rows) {
      expect(row._id).toBe(`${userId.toHexString()}:${row.stepKey}`);
      expect(row.status).toBe("queued");
      expect(row.sequence).toBe("welcome");
    }
  });

  it("sends one tip a day for the first five days, starting at signup", () => {
    const tips = WELCOME_SEQUENCE.slice(0, 5);
    expect(tips.map((step) => step.key)).toEqual([
      "cmd-k",
      "shortcut-list",
      "jump-around",
      "adjusting-times",
      "roundup",
    ]);
    expect(
      tips.map((step) => computeSendAt(signedUpAt, step, "real").toISOString()),
    ).toEqual([
      "2026-01-01T12:00:00.000Z",
      "2026-01-02T12:00:00.000Z",
      "2026-01-03T12:00:00.000Z",
      "2026-01-04T12:00:00.000Z",
      "2026-01-05T12:00:00.000Z",
    ]);
  });

  it("finishes onboarding with a review on day 5", () => {
    const review = findWelcomeStep("weekly-review");
    expect(review?.delayDays).toBe(5);
    expect(computeSendAt(signedUpAt, review!, "real").toISOString()).toBe(
      "2026-01-06T12:00:00.000Z",
    );
  });

  it("spaces fast profile sendAt values by minutes", () => {
    const welcome = computeSendAt(signedUpAt, WELCOME_SEQUENCE[0]!, "fast");
    const shortcuts = computeSendAt(signedUpAt, WELCOME_SEQUENCE[1]!, "fast");

    expect(welcome.toISOString()).toBe("2026-01-01T12:00:00.000Z");
    expect(shortcuts.toISOString()).toBe("2026-01-01T12:01:00.000Z");
  });

  it("schedules trial-ending on day 5", () => {
    const step = findWelcomeStep("trial-ending");
    expect(step?.delayDays).toBe(5);
    const sendAt = computeSendAt(signedUpAt, step!, "real");
    expect(sendAt.toISOString()).toBe("2026-01-06T12:00:00.000Z");
  });

  it("skips trial-ending for active subscribers and accounts without a Stripe subscription", () => {
    const step = findWelcomeStep("trial-ending");
    expect(step?.skipIf?.({})).toBe(true);
    expect(
      step?.skipIf?.({
        billing: { subscriptionStatus: "awaiting_checkout" },
      }),
    ).toBe(true);
    expect(
      step?.skipIf?.({
        billing: {
          subscriptionStatus: "trialing",
          stripeSubscriptionId: "sub_1",
        },
      }),
    ).toBe(false);
    expect(
      step?.skipIf?.({
        billing: {
          subscriptionStatus: "active",
          stripeSubscriptionId: "sub_1",
        },
      }),
    ).toBe(true);
  });
});
