import express from "express";
import { type ProviderAccountId } from "@core/types/sync/identity.contracts";
import {
  ensureEventsResource,
  FakeReader,
  fakeAdapters,
  pageOf,
  seedProviderCalendar,
} from "@sync/__tests__/helpers/fixtures";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import {
  createInternalAuthMiddleware,
  signInternalRequest,
} from "@sync/auth/internal-auth";
import { ProviderRegistry } from "@sync/providers/provider-registry";
import { registerReflectionRoutes } from "@sync/server/reflection.routes";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { ProviderConnectionRepository } from "@sync/storage/repositories/provider-connection.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";
import { afterEach, describe, expect, it } from "bun:test";
import { createServer, type Server } from "node:http";
import { type AddressInfo } from "node:net";

describe("signed reflection HTTP routes", () => {
  const storage = setupSyncStorage(import.meta.url);
  const secret = "reflection-route-test";
  let server: Server | undefined;
  afterEach(async () => {
    if (server)
      await new Promise<void>((resolve, reject) =>
        server!.close((error) => (error ? reject(error) : resolve())),
      );
    server = undefined;
  });

  it("authenticates reads and queues history work only for the signed principal", async () => {
    const db = storage.db();
    const calendars = new ProviderCalendarRepository(db);
    const own = await seedProviderCalendar(calendars);
    const foreign = await seedProviderCalendar(calendars);
    const resources = new SyncResourceRepository(db);
    await ensureEventsResource(resources, own, { cursor: "existing" });
    await ensureEventsResource(resources, foreign, { cursor: "existing" });
    const connections = new ProviderConnectionRepository(db);
    // Calendar fixtures normally omit the connection because most tests do not
    // resolve a provider. Use the same connection identity here as discovery.
    const connection = await connections.upsertByProviderAccount({
      tenantId: own.tenantId,
      principalId: own.principalId,
      provider: "google",
      account: {
        providerAccountId: "test-account" as ProviderAccountId,
        email: "me@example.com",
        displayName: null,
      },
      capabilities: ["readEvents"],
      state: "healthy",
      stateReason: null,
    });
    await db
      .collection(SYNC_COLLECTIONS.syncResources)
      .updateOne(
        { calendarId: own._id },
        { $set: { connectionId: connection._id } },
      );
    const reader = Object.assign(new FakeReader([pageOf([])]), {
      supportsFullHistory: true,
    });
    const registry = new ProviderRegistry(
      new Map([
        [
          "google",
          {
            adapters: fakeAdapters(reader),
            scopes: { forFeatures: () => [] },
            capabilities: ["readEvents"],
            capabilitiesFromScopes: () => ["readEvents"],
            callbackPath: "/sync/google",
            notificationsCallbackPath: "/sync/notifications/google",
          },
        ],
      ]),
    );
    const app = express();
    app.use(express.json());
    registerReflectionRoutes(app, {
      mongo: storage.mongo(),
      registry,
      execution: "active",
      authMiddleware: createInternalAuthMiddleware({ secret }),
    });
    server = createServer(app);
    await new Promise<void>((resolve) =>
      server!.listen(0, "127.0.0.1", resolve),
    );
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/internal/reflection`;
    const timestamp = Date.now();
    const headers = {
      "content-type": "application/json",
      "x-sync-tenant": own.tenantId,
      "x-sync-principal": own.principalId,
      "x-sync-timestamp": String(timestamp),
      "x-sync-signature": signInternalRequest(secret, {
        timestamp,
        tenantId: own.tenantId,
        principalId: own.principalId,
      }),
    };
    const body = JSON.stringify({
      calendarIds: [own._id, foreign._id],
      selfEmails: [],
      windows: [],
    });
    const unsigned = await fetch(`${base}/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(unsigned.status).toBe(401);
    const read = await fetch(`${base}/read`, { method: "POST", headers, body });
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({
      events: [],
      historyComplete: false,
    });
    const queued = await fetch(`${base}/import`, {
      method: "POST",
      headers,
      body: JSON.stringify({ calendarIds: [own._id, foreign._id] }),
    });
    expect(queued.status).toBe(200);
    expect(await queued.json()).toEqual({
      queued: 1,
      unsupportedCalendars: [],
    });
    const jobs = await db.collection(SYNC_COLLECTIONS.jobs).find({}).toArray();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.principalId).toBe(own.principalId);
    expect(jobs[0]?.kind).toBe("repair");
    const tampered = await fetch(`${base}/read`, {
      method: "POST",
      headers: { ...headers, "x-sync-principal": foreign.principalId },
      body,
    });
    expect(tampered.status).toBe(401);
    const malformed = await fetch(`${base}/read`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        calendarIds: [],
        selfEmails: [],
        windows: [],
        principalId: foreign.principalId,
      }),
    });
    expect(malformed.status).toBe(400);
    const oversizedDates = await fetch(`${base}/read`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        calendarIds: [own._id],
        selfEmails: [],
        windows: [
          {
            key: "history",
            start: "2026-11-01T00:00:00Z",
            end: "2026-11-08T00:00:00Z",
            startDate: "1900-01-01",
            endDate: "2026-11-08",
          },
        ],
      }),
    });
    expect(oversizedDates.status).toBe(400);
  });
});
