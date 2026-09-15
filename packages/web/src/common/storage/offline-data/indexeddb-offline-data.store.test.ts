import { faker } from "@faker-js/faker";
import Dexie from "dexie";
import { EventSchema } from "@core/types/event.contracts";
import { EventListQuerySchema } from "@core/types/event-command.contracts";
import { deleteCompassLocalDb } from "@web/__tests__/utils/storage/indexeddb.test.util";
import { type LocalEventRecord } from "@web/events/types/local-event.record";
import { IndexedDbOfflineDataStore } from "./indexeddb-offline-data.store";
import { type StoredTask } from "./offline-data.store";
import { afterEach, describe, expect, it } from "bun:test";

const localRecord = (overrides: {
  title: string;
  schedule: Record<string, unknown>;
}): LocalEventRecord => {
  const id = faker.database.mongodbObjectId();
  const event = EventSchema.parse({
    id,
    calendarId: faker.database.mongodbObjectId(),
    content: {
      kind: "details",
      title: overrides.title,
      description: "",
    },
    schedule: overrides.schedule,
    recurrence: { kind: "single" },
    createdAt: "2026-07-14T09:00:00-06:00",
    updatedAt: null,
  });
  return { version: 2, id: event.id, event, isDemo: false };
};

const eventListQuery = (start: string, end: string) =>
  EventListQuerySchema.parse({ kind: "range", start, end });

const detailsTitle = (record: LocalEventRecord): string =>
  record.event.content.kind === "details" ? record.event.content.title : "";

describe("IndexedDbOfflineDataStore (real Dexie + fake-indexeddb)", () => {
  afterEach(async () => {
    await deleteCompassLocalDb();
  });

  it("retains the legacy tasks table for data recovery", async () => {
    const store = new IndexedDbOfflineDataStore();
    await store.initialize();

    expect(store.isReady()).toBe(true);

    const recoveryDb = new Dexie("compass-local");
    recoveryDb.version(4).stores({
      tasks: "_id, dateKey, status, order",
    });
    await recoveryDb.open();
    const tasks = recoveryDb.table<StoredTask, string>("tasks");
    await tasks.put({
      _id: "task-1",
      dateKey: "2026-07-07",
      title: "Write a real Dexie test",
      status: "todo",
      order: 0,
      createdAt: "2026-07-07T00:00:00.000Z",
      user: "local",
    });

    const recoveredTasks = await tasks.toArray();

    expect(recoveredTasks).toHaveLength(1);
    expect(recoveredTasks[0]).toMatchObject({
      _id: "task-1",
      title: "Write a real Dexie test",
      status: "todo",
    });

    recoveryDb.close();
    store.close();
  });

  it("reads and clears the tasks table via getAllTasks/clearAllTasks", async () => {
    const store = new IndexedDbOfflineDataStore();
    await store.initialize();

    const recoveryDb = new Dexie("compass-local");
    recoveryDb.version(4).stores({
      tasks: "_id, dateKey, status, order",
    });
    await recoveryDb.open();
    await recoveryDb.table<StoredTask, string>("tasks").put({
      _id: "task-1",
      dateKey: "2026-07-07",
      title: "Recover me",
      status: "todo",
      order: 0,
      createdAt: "2026-07-07T00:00:00.000Z",
      user: "local",
    });
    recoveryDb.close();

    expect(await store.getAllTasks()).toHaveLength(1);

    await store.clearAllTasks();

    expect(await store.getAllTasks()).toHaveLength(0);

    store.close();
  });

  it("counts tasks via getTaskCount without reading every row", async () => {
    const store = new IndexedDbOfflineDataStore();
    await store.initialize();

    expect(await store.getTaskCount()).toBe(0);

    const recoveryDb = new Dexie("compass-local");
    recoveryDb.version(4).stores({
      tasks: "_id, dateKey, status, order",
    });
    await recoveryDb.open();
    await recoveryDb.table<StoredTask, string>("tasks").put({
      _id: "task-1",
      dateKey: "2026-07-07",
      title: "Recover me",
      status: "todo",
      order: 0,
      createdAt: "2026-07-07T00:00:00.000Z",
      user: "local",
    });
    recoveryDb.close();

    expect(await store.getTaskCount()).toBe(1);

    await store.clearAllTasks();

    expect(await store.getTaskCount()).toBe(0);

    store.close();
  });

  it("getEvents returns overlapping timed and all-day rows", async () => {
    const store = new IndexedDbOfflineDataStore();
    await store.initialize();

    const inWindowTimed = localRecord({
      title: "timed-in",
      schedule: {
        kind: "timed",
        start: "2026-07-15T09:00:00.000Z",
        end: "2026-07-15T10:00:00.000Z",
        timeZone: "UTC",
      },
    });
    const outsideTimed = localRecord({
      title: "timed-out",
      schedule: {
        kind: "timed",
        start: "2026-07-20T09:00:00.000Z",
        end: "2026-07-20T10:00:00.000Z",
        timeZone: "UTC",
      },
    });
    // Absolute overlap with a Denver-midnight window, but the +09:00 start
    // string sorts after the -06:00 query end — proves Date.parse (not
    // lexicographic start index) gates timed membership.
    const offsetTimed = localRecord({
      title: "timed-offset",
      schedule: {
        kind: "timed",
        start: "2026-07-20T10:00:00+09:00",
        end: "2026-07-20T11:00:00+09:00",
        timeZone: "Asia/Tokyo",
      },
    });
    const spanningAllDay = localRecord({
      title: "allday-span",
      schedule: {
        kind: "allDay",
        start: "2026-07-14",
        end: "2026-07-17",
      },
    });
    const outsideAllDay = localRecord({
      title: "allday-out",
      schedule: {
        kind: "allDay",
        start: "2026-07-20",
        end: "2026-07-21",
      },
    });

    await store.putEvents([
      inWindowTimed,
      outsideTimed,
      offsetTimed,
      spanningAllDay,
      outsideAllDay,
    ]);

    const denverDay = await store.getEvents(
      eventListQuery("2026-07-15T00:00:00.000Z", "2026-07-16T00:00:00.000Z"),
    );
    expect(denverDay.map(detailsTitle).sort()).toEqual([
      "allday-span",
      "timed-in",
    ]);

    const offsetWindow = await store.getEvents(
      eventListQuery("2026-07-19T00:00:00-06:00", "2026-07-20T00:00:00-06:00"),
    );
    expect(offsetWindow.map(detailsTitle)).toContain("timed-offset");

    store.close();
  });

  it("searchByTitle matches a title inside the one-year window", async () => {
    const store = new IndexedDbOfflineDataStore();
    await store.initialize();
    const dentist = localRecord({
      title: "Dentist",
      schedule: {
        kind: "timed",
        start: "2026-09-16T14:00:00.000Z",
        end: "2026-09-16T15:00:00.000Z",
        timeZone: "UTC",
      },
    });
    const standup = localRecord({
      title: "Standup",
      schedule: {
        kind: "timed",
        start: "2026-09-16T10:00:00.000Z",
        end: "2026-09-16T10:30:00.000Z",
        timeZone: "UTC",
      },
    });
    await store.putEvents([dentist, standup]);

    const hits = await store.searchByTitle(
      "dent",
      Date.parse("2026-09-15T12:00:00.000Z"),
    );

    expect(hits.map((event) => event.content)).toEqual([
      expect.objectContaining({ title: "Dentist" }),
    ]);

    store.close();
  });
});
