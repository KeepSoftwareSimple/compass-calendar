import { NodeEnv } from "@core/constants/core.constants";
import { POSTHOG_ERROR_TRACKING_PROPERTY } from "@core/constants/posthog-error-tracking.properties";
import { HTTP_SERVER_LIMITS } from "@core/server/http-server";
import { normalizeDeployVersion } from "@core/util/deploy-version.util";
import { createSyncService, type SyncService } from "@sync/app";
import { type SyncConfig } from "@sync/config/sync.config";
import { ReadinessRegistry } from "@sync/lifecycle/readiness";
import { buildSyncApp } from "@sync/server/sync.server";
import { afterEach, describe, expect, it } from "bun:test";
import { type AddressInfo } from "node:net";

const testConfig = (overrides: Partial<SyncConfig> = {}): SyncConfig =>
  ({
    NODE_ENV: NodeEnv.Test,
    PORT: 0,
    MONGO_URI: "mongodb://localhost:27017/compass_sync",
    INTERNAL_AUTH_TOKEN: "token",
    CALLBACK_BASE_URL: "http://localhost:3010",
    EXECUTION: "passive",
    MAX_CONCURRENCY: 4,
    ...overrides,
  }) as SyncConfig;

async function listen(service: SyncService): Promise<string> {
  await new Promise<void>((resolve) => service.httpServer.listen(0, resolve));
  const { port } = service.httpServer.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe("buildSyncApp", () => {
  it("trusts one proxy hop so Caddy X-Forwarded-For does not trip rate-limit", () => {
    const app = buildSyncApp({
      identity: {
        name: "compass-sync",
        environment: NodeEnv.Test,
        execution: "passive",
        version: "dev",
      },
      readiness: new ReadinessRegistry(),
    });
    expect(app.get("trust proxy")).toBe(1);
  });
});

describe("Sync HTTP server health endpoints", () => {
  let service: SyncService;

  afterEach(async () => {
    await service.stop();
  });

  it("uses the shared bounded HTTP connection limits", () => {
    service = createSyncService(testConfig());
    expect(service.httpServer.requestTimeout).toBe(
      HTTP_SERVER_LIMITS.requestTimeoutMs,
    );
    expect(service.httpServer.headersTimeout).toBe(
      HTTP_SERVER_LIMITS.headersTimeoutMs,
    );
  });

  it("serves liveness with structured, content-free identity", async () => {
    service = createSyncService(testConfig({ EXECUTION: "passive" }));
    const base = await listen(service);

    const res = await fetch(`${base}/health/live`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "alive",
      service: "compass-sync",
      environment: NodeEnv.Test,
      execution: "passive",
    });
  });

  it("reports not-ready with 503 while no dependency checks are registered", async () => {
    service = createSyncService(testConfig());
    const base = await listen(service);

    const res = await fetch(`${base}/health/ready`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("not_ready");
  });

  it("reports ready with 200 once a registered dependency check passes", async () => {
    service = createSyncService(
      testConfig({ VERSION: "v1.2.3" } as Partial<SyncConfig>),
    );
    service.readiness.register("storage", () => true);
    const base = await listen(service);

    const res = await fetch(`${base}/health/ready`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      version?: string;
    };
    expect(body.status).toBe("ready");
    expect(body[POSTHOG_ERROR_TRACKING_PROPERTY.version]).toBe(
      normalizeDeployVersion("v1.2.3"),
    );
  });

  it("reflects the active execution mode on liveness", async () => {
    service = createSyncService(testConfig({ EXECUTION: "active" }));
    const base = await listen(service);

    const res = await fetch(`${base}/health/live`);
    const body = (await res.json()) as { execution: string };
    expect(body.execution).toBe("active");
  });

  it("closes the HTTP front door on graceful stop", async () => {
    service = createSyncService(testConfig());
    await listen(service);
    expect(service.httpServer.listening).toBe(true);

    await service.stop();
    expect(service.httpServer.listening).toBe(false);
  });

  it("closes the HTTP listener before draining dependencies", async () => {
    service = createSyncService(testConfig());
    await listen(service);

    const events: string[] = [];
    // A dependency drain (as later commits will register) records when it
    // runs; the HTTP listener must already be closed by then.
    service.shutdown.register("dependency", () => {
      events.push(
        service.httpServer.listening ? "http-still-open" : "http-closed",
      );
    });

    await service.stop();
    expect(events).toEqual(["http-closed"]);
  });

  it("is idempotent — a second stop does not re-run dependency drains", async () => {
    service = createSyncService(testConfig());
    await listen(service);

    let drains = 0;
    service.shutdown.register("dependency", () => {
      drains += 1;
    });

    await service.stop();
    await service.stop();
    expect(drains).toBe(1);
  });
});
