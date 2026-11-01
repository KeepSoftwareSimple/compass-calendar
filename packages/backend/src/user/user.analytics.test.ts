import { mockEnv } from "@backend/__tests__/helpers/mock.setup";
import { userAnalytics } from "@backend/user/user.analytics";
import { afterEach, describe, expect, it, mock } from "bun:test";

mock.module("@backend/user/posthog-synthetic-account.util", () => ({
  posthogSyntheticFlagsForCompassUserId: mock(async () => ({
    $internal_or_test_user: true,
    is_synthetic: true,
  })),
}));

describe("userAnalytics.capture", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("posts account_deleted with environment", async () => {
    using _env = mockEnv({
      POSTHOG_KEY: "phc_test",
      POSTHOG_HOST: "https://ph.example.test",
    });
    const bodies: unknown[] = [];
    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      bodies.push(JSON.parse(String(init?.body)));
      return { ok: true, status: 200 } as Response;
    }) as unknown as typeof fetch;

    await expect(
      userAnalytics.capture({ event: "account_deleted", userId: "u1" }),
    ).resolves.toBe(true);

    expect(bodies[0]).toMatchObject({
      event: "account_deleted",
      distinct_id: "u1",
      properties: {
        environment: "test",
        $internal_or_test_user: true,
        is_synthetic: true,
      },
    });
  });
});
