import { faker } from "@faker-js/faker";
import {
  type CalendarId,
  type DateTime,
  type EventId,
} from "@core/types/domain-primitives";
import { type ServerMessage } from "@core/types/server-message.contracts";
import { type ChangeFeedCursor } from "@core/types/sync/change-feed.contracts";
import {
  type ConnectionId,
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { FakeScheduler } from "@backend/__tests__/helpers/fake-scheduler";
import {
  SyncChangeFeedBridge,
  type SyncChangeFeedBridgeDeps,
} from "@backend/servers/sse/sync-change-feed.bridge";

const objectId = () => faker.database.mongodbObjectId();

class FakeClient {
  calls: Array<string | null> = [];
  #responses: Array<Awaited<ReturnType<FakeClient["getGlobalChanges"]>>>;

  constructor(
    responses: Array<Awaited<ReturnType<FakeClient["getGlobalChanges"]>>>,
  ) {
    this.#responses = responses;
  }

  getGlobalChanges = async (
    cursor: string | null,
  ): ReturnType<SyncChangeFeedBridgeDeps["client"]["getGlobalChanges"]> => {
    this.calls.push(cursor);
    const next = this.#responses.shift();
    if (!next) throw new Error("no response queued");
    return next as never;
  };
}

class FakeSse {
  published: Array<{ userId: string; message: ServerMessage }> = [];
  #connected: string[];

  constructor(connected: string[] = []) {
    this.#connected = connected;
  }

  connectedUserIds = (): string[] => this.#connected;
  publish = (userId: string, message: ServerMessage): void => {
    this.published.push({ userId, message });
  };
  publishCalendarsChanged = (
    userId: string,
    calendarIds: CalendarId[],
  ): void => {
    this.published.push({
      userId,
      message: { type: "calendarsChanged", calendarIds },
    });
  };
  publishEventsChanged = (
    userId: string,
    payload: {
      calendarId: CalendarId;
      eventIds: EventId[];
      reason: "created" | "updated" | "deleted" | "reconciled";
    },
  ): void => {
    this.published.push({
      userId,
      message: { type: "eventsChanged", ...payload },
    });
  };
}

describe("SyncChangeFeedBridge", () => {
  it("fans an invalidation out to the envelope's own principal, not a fixed one", async () => {
    const userA = objectId();
    const userB = objectId();
    const scheduler = new FakeScheduler();
    const client = new FakeClient([
      {
        ok: true,
        correlationId: "c1",
        value: {
          kind: "ok",
          invalidations: [
            {
              invalidation: {
                kind: "connection",
                connectionId: objectId() as ConnectionId,
              },
              emittedAt: "2026-07-30T00:00:00.000Z" as DateTime,
              tenantId: userA as TenantId,
              principalId: userA as PrincipalId,
            },
            {
              invalidation: {
                kind: "event",
                eventId: objectId() as EventId,
                calendarId: objectId() as CalendarId,
              },
              emittedAt: "2026-07-30T00:00:01.000Z" as DateTime,
              tenantId: userB as TenantId,
              principalId: userB as PrincipalId,
            },
          ],
          nextCursor: objectId() as ChangeFeedCursor,
        },
      },
    ]);
    const sse = new FakeSse();
    const bridge = new SyncChangeFeedBridge(
      { client, sse: sse as never },
      { schedule: scheduler.schedule },
    );

    bridge.start();
    await scheduler.fireNext();
    bridge.stop();

    expect(client.calls).toEqual([null]);
    // A "connection" invalidation translates to 2 messages (calendarsChanged
    // + eventsChanged), an "event" invalidation to 1 — see
    // sync-invalidation.to-server-message.ts. Each set must land on its OWN
    // envelope's principal, not the other's — the whole point of carrying
    // principalId on the wire for the global feed.
    const forA = sse.published.filter((p) => p.userId === userA);
    const forB = sse.published.filter((p) => p.userId === userB);
    expect(forA.map((p) => p.message.type).sort()).toEqual([
      "calendarsChanged",
      "eventsChanged",
    ]);
    expect(forB.map((p) => p.message.type)).toEqual(["eventsChanged"]);
    expect(forA.length + forB.length).toBe(sse.published.length);
  });

  it("carries the cursor forward across ticks", async () => {
    const cursor1 = objectId() as ChangeFeedCursor;
    const cursor2 = objectId() as ChangeFeedCursor;
    const scheduler = new FakeScheduler();
    const client = new FakeClient([
      {
        ok: true,
        correlationId: "c1",
        value: { kind: "ok", invalidations: [], nextCursor: cursor1 },
      },
      {
        ok: true,
        correlationId: "c2",
        value: { kind: "ok", invalidations: [], nextCursor: cursor2 },
      },
    ]);
    const bridge = new SyncChangeFeedBridge(
      { client, sse: new FakeSse() as never },
      { schedule: scheduler.schedule },
    );

    bridge.start();
    await scheduler.fireNext();
    await scheduler.fireNext();
    bridge.stop();

    expect(client.calls).toEqual([null, cursor1]);
  });

  it("broad-invalidates every currently-connected user on resyncRequired and resets the cursor", async () => {
    const userA = objectId();
    const userB = objectId();
    const scheduler = new FakeScheduler();
    const client = new FakeClient([
      {
        ok: true,
        correlationId: "c1",
        value: {
          kind: "ok",
          invalidations: [],
          nextCursor: objectId() as ChangeFeedCursor,
        },
      },
      { ok: true, correlationId: "c2", value: { kind: "resyncRequired" } },
      {
        ok: true,
        correlationId: "c3",
        value: {
          kind: "ok",
          invalidations: [],
          nextCursor: objectId() as ChangeFeedCursor,
        },
      },
    ]);
    const sse = new FakeSse([userA, userB]);
    const bridge = new SyncChangeFeedBridge(
      { client, sse: sse as never },
      { schedule: scheduler.schedule },
    );

    bridge.start();
    await scheduler.fireNext(); // establishes a cursor
    await scheduler.fireNext(); // resyncRequired
    await scheduler.fireNext(); // next tick resumes from null again
    bridge.stop();

    expect(client.calls).toEqual([null, client.calls[1]!, null]);
    const eventsChangedRecipients = sse.published
      .filter((p) => p.message.type === "eventsChanged")
      .map((p) => p.userId);
    expect(eventsChangedRecipients.sort()).toEqual([userA, userB].sort());
  });

  it("backs off on a poll failure without publishing anything", async () => {
    const scheduler = new FakeScheduler();
    const client = new FakeClient([
      {
        ok: false,
        error: { kind: "unavailable", correlationId: "c1" },
      },
    ]);
    const sse = new FakeSse();
    const bridge = new SyncChangeFeedBridge(
      { client, sse: sse as never },
      { schedule: scheduler.schedule, errorBackoffMs: 9999 },
    );

    bridge.start();
    await scheduler.fireNext();
    bridge.stop();

    expect(sse.published).toEqual([]);
    expect(scheduler.pending).toEqual([]); // stop() cleared the backoff timer
  });

  it("start() is idempotent — a second call does not schedule a duplicate poll", async () => {
    const scheduler = new FakeScheduler();
    const client = new FakeClient([
      {
        ok: true,
        correlationId: "c1",
        value: {
          kind: "ok",
          invalidations: [],
          nextCursor: objectId() as ChangeFeedCursor,
        },
      },
    ]);
    const bridge = new SyncChangeFeedBridge(
      { client, sse: new FakeSse() as never },
      { schedule: scheduler.schedule },
    );

    bridge.start();
    bridge.start();
    expect(scheduler.pending).toHaveLength(1);
    bridge.stop();
  });

  it("reschedules after a throw instead of dying — a bad invalidation must not stop the global poller forever", async () => {
    const scheduler = new FakeScheduler();
    const client = new FakeClient([
      {
        ok: true,
        correlationId: "c1",
        value: {
          kind: "ok",
          invalidations: [
            {
              invalidation: {
                kind: "connection",
                connectionId: objectId() as ConnectionId,
              },
              emittedAt: "2026-07-30T00:00:00.000Z" as DateTime,
              tenantId: objectId() as TenantId,
              principalId: objectId() as PrincipalId,
            },
          ],
          nextCursor: objectId() as ChangeFeedCursor,
        },
      },
      {
        ok: true,
        correlationId: "c2",
        value: {
          kind: "ok",
          invalidations: [],
          nextCursor: objectId() as ChangeFeedCursor,
        },
      },
    ]);
    const sse = new FakeSse();
    sse.publish = () => {
      throw new Error("boom: malformed invalidation");
    };
    const bridge = new SyncChangeFeedBridge(
      { client, sse: sse as never },
      { schedule: scheduler.schedule, errorBackoffMs: 9999 },
    );

    bridge.start();
    await scheduler.fireNext(); // publish() throws mid-tick
    expect(scheduler.pending).toHaveLength(1); // still rescheduled, on the backoff
    expect(scheduler.pending[0]?.delayMs).toBe(9999);

    await scheduler.fireNext(); // next tick runs normally, not stuck
    bridge.stop();

    expect(client.calls).toEqual([null, null]); // cursor never advanced past the throw
  });

  it("stop() clears the pending tick before it ever runs", () => {
    const scheduler = new FakeScheduler();
    const client = new FakeClient([]);
    const bridge = new SyncChangeFeedBridge(
      { client, sse: new FakeSse() as never },
      { schedule: scheduler.schedule },
    );

    bridge.start();
    expect(scheduler.pending).toHaveLength(1);
    bridge.stop();
    expect(scheduler.pending).toEqual([]);
  });
});
