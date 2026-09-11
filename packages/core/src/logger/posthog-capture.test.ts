import {
  captureSafely,
  createPostHogCaptureClient,
} from "@core/logger/posthog-capture";
import { describe, expect, it } from "bun:test";

describe("createPostHogCaptureClient", () => {
  it("posts a capture payload to /i/v0/e/", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const client = createPostHogCaptureClient({
      apiKey: "phc_test",
      host: "https://us.i.posthog.com",
      lib: "compass-sync",
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          url: String(input),
          body: JSON.parse(String(init?.body)),
        });
        return { ok: true, status: 200 } as Response;
      }) as unknown as typeof fetch,
    });

    await client.capture({
      event: "sync_health_snapshot",
      distinctId: "compass-sync",
      properties: { service: "compass-sync", healthy: 1 },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://us.i.posthog.com/i/v0/e/");
    expect(calls[0]?.body).toMatchObject({
      api_key: "phc_test",
      distinct_id: "compass-sync",
      event: "sync_health_snapshot",
      properties: {
        service: "compass-sync",
        healthy: 1,
        $lib: "compass-sync",
      },
    });
  });

  it("captureSafely returns false without throwing when client is null", async () => {
    await expect(
      captureSafely(null, {
        event: "sync_health_snapshot",
        distinctId: "compass-sync",
        properties: {},
      }),
    ).resolves.toBe(false);
  });

  it("captureSafely swallows delivery failures", async () => {
    const client = createPostHogCaptureClient({
      apiKey: "phc_test",
      host: "https://us.i.posthog.com",
      lib: "compass-sync",
      fetch: (async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    });

    await expect(
      captureSafely(client, {
        event: "sync_health_snapshot",
        distinctId: "compass-sync",
        properties: {},
      }),
    ).resolves.toBe(false);
  });
});
