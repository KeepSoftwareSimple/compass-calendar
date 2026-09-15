import { ObjectId } from "mongodb";
import { seedGoogleCalendar } from "@backend/__tests__/helpers/event-propagation.test-helpers";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { CalendarRecordSchema } from "@backend/calendar/calendar.record";
import {
  CALENDAR_USER_ID_INDEX,
  CALENDAR_USER_ID_LOCAL_UNIQUE_INDEX,
  ensureCalendarIndexes,
} from "@backend/calendar/calendar-indexes";
import calendarService from "@backend/calendar/services/calendar.service";
import mongoService from "@backend/common/services/mongo.service";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

const indexNamesFromPlan = (stage: unknown, names: string[] = []): string[] => {
  if (!stage || typeof stage !== "object") return names;
  const record = stage as Record<string, unknown>;
  if (typeof record["indexName"] === "string") names.push(record["indexName"]);
  if (record["inputStage"]) indexNamesFromPlan(record["inputStage"], names);
  if (record["queryPlan"]) indexNamesFromPlan(record["queryPlan"], names);
  if (Array.isArray(record["inputStages"])) {
    for (const child of record["inputStages"]) {
      indexNamesFromPlan(child, names);
    }
  }
  return names;
};

const planHasIxscan = (stage: unknown): boolean => {
  if (!stage || typeof stage !== "object") return false;
  const record = stage as Record<string, unknown>;
  if (record["stage"] === "IXSCAN") return true;
  if (record["inputStage"] && planHasIxscan(record["inputStage"])) return true;
  if (record["queryPlan"] && planHasIxscan(record["queryPlan"])) return true;
  if (Array.isArray(record["inputStages"])) {
    return record["inputStages"].some((child) => planHasIxscan(child));
  }
  return false;
};

const winningPlan = (explained: unknown): unknown =>
  (explained as { queryPlanner?: { winningPlan?: unknown } }).queryPlanner
    ?.winningPlan;

describe("calendar indexes", () => {
  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await ensureCalendarIndexes();
  });

  beforeEach(cleanupCollections);

  afterAll(cleanupTestDb);

  const seedLocalCalendar = async (userId: ObjectId) => {
    const record = CalendarRecordSchema.parse({
      _id: new ObjectId(),
      userId,
      name: "Compass",
      description: "",
      timeZone: null,
      foregroundColor: "#000000",
      backgroundColor: "#ffffff",
      access: "owner",
      isPrimary: false,
      isVisible: true,
      isActive: true,
      source: { provider: "local" },
      createdAt: new Date(),
      updatedAt: null,
    });
    await mongoService.calendar.insertOne(record);
    return record;
  };

  it("creates the userId and local unique indexes", async () => {
    const indexes = await mongoService.calendar.indexes();
    const names = indexes.map((index) => index.name);
    expect(names).toContain(CALENDAR_USER_ID_INDEX);
    expect(names).toContain(CALENDAR_USER_ID_LOCAL_UNIQUE_INDEX);
  });

  it("rejects a second local calendar for the same user", async () => {
    const userId = new ObjectId();
    await seedLocalCalendar(userId);

    await expect(seedLocalCalendar(userId)).rejects.toMatchObject({
      code: 11000,
    });
  });

  it("allows a google calendar alongside the local calendar for the same user", async () => {
    const userId = new ObjectId();
    await seedLocalCalendar(userId);
    await seedGoogleCalendar(userId);

    const calendars = await calendarService.list(userId);
    expect(calendars).toHaveLength(2);
  });

  it("uses an index scan for getLocalCalendar", async () => {
    const userId = new ObjectId();
    const local = await seedLocalCalendar(userId);
    await seedGoogleCalendar(userId);

    const found = await calendarService.getLocalCalendar(userId);
    expect(found?._id).toEqual(local._id);

    const explained = await mongoService.calendar
      .find({ userId, "source.provider": "local" })
      .limit(1)
      .explain("queryPlanner");
    const plan = winningPlan(explained);
    const used = indexNamesFromPlan(plan);
    expect(planHasIxscan(plan)).toBe(true);
    expect(
      used.some(
        (name) =>
          name === CALENDAR_USER_ID_LOCAL_UNIQUE_INDEX ||
          name === CALENDAR_USER_ID_INDEX,
      ),
    ).toBe(true);
  });

  it("uses the userId index for calendarService.list", async () => {
    const userId = new ObjectId();
    await seedLocalCalendar(userId);
    await seedGoogleCalendar(userId);

    const explained = await mongoService.calendar
      .find({ userId })
      .explain("queryPlanner");
    const plan = winningPlan(explained);
    const used = indexNamesFromPlan(plan);
    expect(planHasIxscan(plan)).toBe(true);
    expect(used).toContain(CALENDAR_USER_ID_INDEX);
  });

  it("keeps a pre-existing unnamed userId index instead of crashing startup", async () => {
    await mongoService.calendar.dropIndex(CALENDAR_USER_ID_INDEX);

    try {
      // The retired July migration created this index without a name.
      await mongoService.calendar.createIndex({ userId: 1 });

      await expect(ensureCalendarIndexes()).resolves.toBeUndefined();

      const indexes = await mongoService.calendar.indexes();
      const names = indexes.map((index) => index.name);
      expect(names).toContain("userId_1");
      expect(names).not.toContain(CALENDAR_USER_ID_INDEX);
    } finally {
      await mongoService.calendar.dropIndex("userId_1");
      await ensureCalendarIndexes();
    }
  });

  it("skips the unique index when duplicate local calendars already exist", async () => {
    const userId = new ObjectId();
    await mongoService.calendar.dropIndex(CALENDAR_USER_ID_LOCAL_UNIQUE_INDEX);

    try {
      await seedLocalCalendar(userId);
      await seedLocalCalendar(userId);

      await ensureCalendarIndexes();

      const indexes = await mongoService.calendar.indexes();
      const names = indexes.map((index) => index.name);
      expect(names).toContain(CALENDAR_USER_ID_INDEX);
      expect(names).not.toContain(CALENDAR_USER_ID_LOCAL_UNIQUE_INDEX);
    } finally {
      await mongoService.calendar.deleteMany({ userId });
      await ensureCalendarIndexes();
    }
  });
});
