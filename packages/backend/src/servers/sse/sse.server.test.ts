/**
 * we do not need the database for this test
 */

import { type Response } from "express";
import { ObjectId } from "mongodb";
import { type CalendarId, type EventId } from "@core/types/domain-primitives";
import {
  type ServerMessage,
  ServerMessageSchema,
} from "@core/types/server-message.contracts";
import { BaseDriver } from "@backend/__tests__/drivers/base.driver";
import { setupBackendTestSeams } from "@backend/__tests__/helpers/mock.setup";
import { type TickScheduler } from "@backend/servers/sse/tick-scheduler";
import userMetadataService from "@backend/user/services/user-metadata.service";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

describe("SSE Server", () => {
  const baseDriver = new BaseDriver();

  beforeAll(async () => {
    setupBackendTestSeams();
    await baseDriver.listen();
  });

  afterAll(async () => baseDriver.teardown());

  beforeEach(() => {
    spyOn(userMetadataService, "fetchUserMetadata").mockResolvedValue({
      sync: { importGCal: null },
    });
  });

  describe("subscribe() and a stream that ends before headers flush (#3449)", () => {
    it("does not throw and registers no connection when flushHeaders() throws", async () => {
      const { sseServer } = await import("./sse.server");
      const userId = new ObjectId().toString();

      const res = {
        setHeader: mock(),
        flushHeaders: mock(() => {
          // Mirrors the Bun runtime error observed in production when a
          // client disconnects between the request arriving and subscribe()
          // flushing headers: unlike Node, Bun throws instead of no-op'ing.
          throw new Error("Stream is already ended");
        }),
      } as unknown as Response;

      let unsubscribe: (() => void) | undefined;
      expect(() => {
        unsubscribe = sseServer.subscribe(userId, res);
      }).not.toThrow();

      expect(sseServer.subscriberCount(userId)).toBe(0);
      expect(() => unsubscribe?.()).not.toThrow();
    });
  });

  describe("planned stream lifetime", () => {
    it("sends retry: 5000 first and closes at the planned lifetime", async () => {
      const { SSEServer, SSE_RETRY_HINT_MS, SSE_STREAM_LIFETIME_MS } =
        await import("./sse.server");
      const userId = new ObjectId().toString();
      const writes: string[] = [];
      let ended = false;
      const ticks: Array<{ tick: () => void; delayMs: number }> = [];
      const schedule: TickScheduler = (tick, delayMs) => {
        ticks.push({ tick, delayMs });
        return { clear: mock() };
      };
      const server = new SSEServer(schedule);

      const res = {
        setHeader: mock(),
        flushHeaders: mock(),
        write: mock((chunk: string) => {
          writes.push(chunk);
        }),
        end: mock(() => {
          ended = true;
        }),
      } as unknown as Response;

      const unsubscribe = server.subscribe(userId, res);
      expect(writes[0]).toBe(`retry: ${SSE_RETRY_HINT_MS}\n\n`);
      expect(server.subscriberCount(userId)).toBe(1);

      const lifetime = ticks.find((t) => t.delayMs === SSE_STREAM_LIFETIME_MS);
      expect(lifetime).toBeDefined();
      lifetime?.tick();
      expect(ended).toBe(true);
      expect(server.subscriberCount(userId)).toBe(0);
      unsubscribe();
    });
  });

  describe("Subscription and events (B10 — single `message` event, dispatched by payload.type):", () => {
    it("delivers eventsChanged to a subscribed user", async () => {
      const userId = new ObjectId().toString();

      const stream = baseDriver.openSSEStream({ userId });
      await stream.waitForEvent("userMetadataChanged", 2000);

      const eventPromise = stream.waitForEvent("eventsChanged", 2000);

      const { sseServer } = await import("./sse.server");
      sseServer.publishEventsChanged(userId, {
        calendarId: new ObjectId().toHexString() as CalendarId,
        eventIds: [new ObjectId().toHexString() as EventId],
        reason: "updated",
      });

      await expect(eventPromise).resolves.toMatchObject({
        type: "eventsChanged",
        reason: "updated",
      });

      stream.close();
    });

    it("delivers calendarsChanged to a subscribed user", async () => {
      const userId = new ObjectId().toString();

      const stream = baseDriver.openSSEStream({ userId });
      await stream.waitForEvent("userMetadataChanged", 2000);

      const eventPromise = stream.waitForEvent("calendarsChanged", 2000);

      const { sseServer } = await import("./sse.server");
      sseServer.publishCalendarsChanged(userId, [
        new ObjectId().toHexString() as CalendarId,
      ]);

      await expect(eventPromise).resolves.toMatchObject({
        type: "calendarsChanged",
      });

      stream.close();
    });

    it("replays userMetadataChanged on connection (cold start)", async () => {
      const userId = new ObjectId().toString();

      const stream = baseDriver.openSSEStream({ userId });

      await expect(
        stream.waitForEvent("userMetadataChanged", 2000),
      ).resolves.toMatchObject({ type: "userMetadataChanged" });

      stream.close();
    });

    it("does not replay userMetadataChanged to existing tabs when a new tab opens", async () => {
      const userId = new ObjectId().toString();

      // Tab A opens and receives its initial replay.
      const streamA = baseDriver.openSSEStream({ userId });
      await expect(
        streamA.waitForEvent("userMetadataChanged", 2000),
      ).resolves.toBeDefined();

      // Tab B opens for the same user — should only replay to tab B.
      const streamB = baseDriver.openSSEStream({ userId });
      await expect(
        streamB.waitForEvent("userMetadataChanged", 2000),
      ).resolves.toBeDefined();

      // Tab A must NOT receive a second userMetadataChanged.
      await expect(
        streamA.waitForNoEvent("userMetadataChanged"),
      ).resolves.toBeUndefined();

      streamA.close();
      streamB.close();
    });

    it("does not deliver events to unsubscribed users", async () => {
      const userId = new ObjectId().toString();
      const otherUserId = new ObjectId().toString();

      const stream = baseDriver.openSSEStream({ userId });
      await stream.waitForEvent("userMetadataChanged", 2000);

      const { sseServer } = await import("./sse.server");
      sseServer.publishEventsChanged(otherUserId, {
        calendarId: new ObjectId().toHexString() as CalendarId,
        eventIds: [],
        reason: "reconciled",
      });

      await expect(
        stream.waitForNoEvent("eventsChanged"),
      ).resolves.toBeUndefined();

      stream.close();
    });
  });

  describe("Publish-site conformance (A27): every `publish*` helper's written frame is a ServerMessage", () => {
    let sseServerModule: typeof import("./sse.server");

    beforeAll(async () => {
      sseServerModule = await import("./sse.server");
    });

    // One entry per `publish*` helper on SSEServer, each driving it with a
    // representative payload and the message `type` its frame should carry.
    // The reflection guard below requires this table to stay exhaustive.
    const cases: Array<{
      method: string;
      type: ServerMessage["type"];
      publish: (userId: string) => void;
    }> = [
      {
        method: "publishEventsChanged",
        type: "eventsChanged",
        publish: (userId) =>
          sseServerModule.sseServer.publishEventsChanged(userId, {
            calendarId: new ObjectId().toHexString() as CalendarId,
            eventIds: [new ObjectId().toHexString() as EventId],
            reason: "created",
          }),
      },
      {
        method: "publishCalendarsChanged",
        type: "calendarsChanged",
        publish: (userId) =>
          sseServerModule.sseServer.publishCalendarsChanged(userId, [
            new ObjectId().toHexString() as CalendarId,
          ]),
      },
      {
        method: "publishSyncStatus",
        type: "syncStatusChanged",
        publish: (userId) =>
          sseServerModule.sseServer.publishSyncStatus(userId, {
            status: "attention",
            code: "CONNECTION_REVOKED",
            retryable: false,
          }),
      },
      {
        method: "publishImportCompleted",
        type: "importCompleted",
        publish: (userId) =>
          sseServerModule.sseServer.publishImportCompleted(userId, {
            operation: "full",
            eventsCount: 12,
            calendarsCount: 3,
          }),
      },
      {
        method: "publishUserMetadata",
        type: "userMetadataChanged",
        publish: (userId) =>
          sseServerModule.sseServer.publishUserMetadata(userId, {
            syncEnabled: true,
          }),
      },
    ];

    it.each(cases)(
      "$method's written frame parses with ServerMessageSchema",
      async ({ type, publish }) => {
        const userId = new ObjectId().toString();
        const stream = baseDriver.openSSEStream({ userId });

        // Cold-start replay: also confirms the subscription is registered
        // server-side before `publish` runs below, same synchronization the
        // other tests in this file rely on to avoid a publish-before-
        // subscribe race.
        await stream.waitForEvent("userMetadataChanged", 2000);

        const framePromise = stream.waitForEvent(type, 2000);
        publish(userId);

        const frame = await framePromise;
        expect(() => ServerMessageSchema.parse(frame)).not.toThrow();
        expect((frame as { type: string }).type).toBe(type);

        stream.close();
      },
    );

    // Mirrors gcal.service.test.ts's quotaUser conformance table (packet 07):
    // enumerate the SSEServer instance's own method surface and require
    // every `publish*` method (excluding the low-level `publish`/
    // `publishTo` primitives the helpers above are built on) to already
    // have a case in the table, so a future publisher can't silently skip
    // this contract.
    const listMethodNames = (instance: object): string[] => {
      const ownNames = Object.getOwnPropertyNames(instance);
      const proto = Object.getPrototypeOf(instance) as object | null;
      const protoNames =
        proto && proto !== Object.prototype
          ? Object.getOwnPropertyNames(proto).filter(
              (name) => name !== "constructor",
            )
          : [];

      return [...new Set([...ownNames, ...protoNames])].filter(
        (name) =>
          typeof (instance as Record<string, unknown>)[name] === "function",
      );
    };

    it("covers every publish* method on SSEServer (fails loudly if a new one is added without a case above)", () => {
      const allMethodNames = listMethodNames(sseServerModule.sseServer);
      const publishMethodNames = allMethodNames.filter(
        (name) =>
          name.startsWith("publish") &&
          name !== "publish" &&
          name !== "publishTo",
      );

      expect(new Set(publishMethodNames)).toEqual(
        new Set(cases.map((c) => c.method)),
      );
    });
  });
});
