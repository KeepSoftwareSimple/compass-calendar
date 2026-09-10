import { ObjectId } from "mongodb";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import mongoService from "@backend/common/services/mongo.service";
import { identitiesProviderSubjectFilter } from "@backend/user/queries/user.queries";
import {
  ensureUserIndexes,
  HIDDEN_EVENT_USER_EVENT_INDEX,
  USER_IDENTITIES_PROVIDER_SUBJECT_INDEX,
} from "@backend/user/user-indexes";
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
  if (typeof record.indexName === "string") names.push(record.indexName);
  if (record.inputStage) indexNamesFromPlan(record.inputStage, names);
  if (Array.isArray(record.inputStages)) {
    for (const child of record.inputStages) {
      indexNamesFromPlan(child, names);
    }
  }
  return names;
};

describe("user indexes", () => {
  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await ensureUserIndexes();
  });

  beforeEach(cleanupCollections);

  afterAll(cleanupTestDb);

  it("rejects a second user with the same identities provider and subjectId", async () => {
    const identity = {
      provider: "google" as const,
      subjectId: "shared-sub",
      email: "a@example.com",
      linkedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    await mongoService.user.insertOne({
      email: "a@example.com",
      name: "A",
      firstName: "A",
      lastName: "User",
      locale: "en",
      identities: [identity],
    });

    await expect(
      mongoService.user.insertOne({
        email: "b@example.com",
        name: "B",
        firstName: "B",
        lastName: "User",
        locale: "en",
        identities: [{ ...identity, email: "b@example.com" }],
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("uses the identities provider+subject index when the partial predicate is present", async () => {
    await mongoService.user.insertOne({
      _id: new ObjectId(),
      email: "indexed@example.com",
      name: "Indexed",
      firstName: "Indexed",
      lastName: "User",
      locale: "en",
      identities: [
        {
          provider: "microsoft",
          subjectId: "ms-sub-index",
          email: "indexed@example.com",
          linkedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    });

    const explained = await mongoService.user
      .find(identitiesProviderSubjectFilter("microsoft", "ms-sub-index"))
      .explain("queryPlanner");
    const plan = (explained as { queryPlanner?: { winningPlan?: unknown } })
      .queryPlanner?.winningPlan;
    const used = indexNamesFromPlan(plan);
    expect(used).toContain(USER_IDENTITIES_PROVIDER_SUBJECT_INDEX);
  });

  it("rejects a second hiddenEvent row for the same user and event id", async () => {
    const userId = new ObjectId();
    await mongoService.hiddenEvent.insertOne({
      _id: new ObjectId(),
      userId,
      eventId: "evt-1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    await expect(
      mongoService.hiddenEvent.insertOne({
        _id: new ObjectId(),
        userId,
        eventId: "evt-1",
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("creates the unique hidden event index", async () => {
    const indexes = await mongoService.hiddenEvent.indexes();
    expect(indexes.map((index) => index.name)).toContain(
      HIDDEN_EVENT_USER_EVENT_INDEX,
    );
  });
});
