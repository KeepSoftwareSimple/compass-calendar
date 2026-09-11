import { mockEnv } from "@backend/__tests__/helpers/mock.setup";
import { billingAnalytics } from "@backend/billing/billing.analytics";
import { afterEach, describe, expect, it } from "bun:test";

describe("billingAnalytics.capture", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("is a no-op without POSTHOG_KEY", async () => {
    using _env = mockEnv({ POSTHOG_KEY: undefined });
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return { ok: true, status: 200 } as Response;
    }) as unknown as typeof fetch;

    await expect(
      billingAnalytics.capture({ event: "checkout_expired", userId: "u1" }),
    ).resolves.toBe(false);
    expect(calls).toBe(0);
  });

  it("posts the event keyed by the Compass user id with the environment", async () => {
    using _env = mockEnv({
      POSTHOG_KEY: "phc_test",
      POSTHOG_HOST: "https://ph.example.test",
    });
    const bodies: unknown[] = [];
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      bodies.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return { ok: true, status: 200 } as Response;
    }) as unknown as typeof fetch;

    await expect(
      billingAnalytics.capture({
        event: "checkout_completed",
        userId: "u1",
        properties: { trial: true },
      }),
    ).resolves.toBe(true);

    expect(bodies).toEqual([
      {
        url: "https://ph.example.test/i/v0/e/",
        body: {
          api_key: "phc_test",
          distinct_id: "u1",
          event: "checkout_completed",
          properties: {
            environment: "test",
            trial: true,
            $lib: "compass-backend",
          },
        },
      },
    ]);
  });

  it("never throws when PostHog rejects the capture", async () => {
    using _env = mockEnv({ POSTHOG_KEY: "phc_test" });
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    await expect(
      billingAnalytics.capture({ event: "checkout_expired", userId: "u1" }),
    ).resolves.toBe(false);
  });
});
