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

  it("redacts booking secrets from capture properties", async () => {
    const calls: Array<{ body: unknown }> = [];
    const client = createPostHogCaptureClient({
      apiKey: "phc_test",
      host: "https://us.i.posthog.com",
      lib: "compass-backend",
      fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ body: JSON.parse(String(init?.body)) });
        return { ok: true, status: 200 } as Response;
      }) as unknown as typeof fetch,
    });

    await client.capture({
      event: "booking_lifecycle",
      distinctId: "compass-backend",
      properties: {
        path: "/meet/confirmed/507f1f77bcf86cd799439011?token=sentinel-capability-token-9f3c",
        guestEmail: "sentinel.guest@example.test",
        reservationId: "507f1f77bcf86cd799439011",
      },
    });

    const serialized = JSON.stringify(calls[0]?.body);
    expect(serialized).not.toContain("sentinel-capability-token-9f3c");
    expect(serialized).not.toContain("sentinel.guest@example.test");
    expect(serialized).not.toContain("507f1f77bcf86cd799439011");
    expect(serialized).toContain("/meet/confirmed/:reservationId");
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
