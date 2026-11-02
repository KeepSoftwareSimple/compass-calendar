import { backfillMeetingTypes } from "@scripts/commands/backfill-meeting-types/backfill";
import { ObjectId } from "mongodb";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import mongoService from "@backend/common/services/mongo.service";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

const insertPage = async (fields: Record<string, unknown>) => {
  const _id = new ObjectId();
  await mongoService.bookingPage.insertOne({
    _id,
    userId: new ObjectId(),
    bookingSlug: `host-${_id.toHexString().slice(-6)}`,
    enabled: false,
    durationMinutes: 30,
    ...fields,
  } as never);
  return _id;
};

describe("backfill-meeting-types (db)", () => {
  beforeAll(() => setupTestDb(import.meta.url));
  beforeEach(cleanupCollections);
  afterAll(cleanupTestDb);

  it("dry-run lists pages without meeting types and writes nothing", async () => {
    const legacy = await insertPage({ durationMinutes: 45 });
    await insertPage({
      meetingTypes: [{ id: "intro", label: "Intro", durationMinutes: 15 }],
    });

    const report = await backfillMeetingTypes(mongoService.bookingPage, {
      dryRun: true,
      batchSize: 1,
    });

    expect(report).toEqual({
      dryRun: true,
      matched: 1,
      modified: 0,
      skipped: [],
      changes: [{ pageId: legacy.toHexString(), durationMinutes: 45 }],
    });
    const stored = await mongoService.bookingPage.findOne({ _id: legacy });
    expect(stored).not.toHaveProperty("meetingTypes");
  });

  it("applies the default type once and is idempotent", async () => {
    const legacy = await insertPage({ durationMinutes: 45 });
    const custom = [{ id: "intro", label: "Intro", durationMinutes: 15 }];
    const configured = await insertPage({ meetingTypes: custom });

    const first = await backfillMeetingTypes(mongoService.bookingPage, {
      dryRun: false,
      batchSize: 500,
    });
    const second = await backfillMeetingTypes(mongoService.bookingPage, {
      dryRun: false,
      batchSize: 500,
    });

    expect(first.modified).toBe(1);
    expect(second).toMatchObject({ matched: 0, modified: 0 });
    expect(
      (await mongoService.bookingPage.findOne({ _id: legacy }))?.meetingTypes,
    ).toEqual([
      { id: "default", label: "45 min meeting", durationMinutes: 45 },
    ]);
    expect(
      (await mongoService.bookingPage.findOne({ _id: configured }))
        ?.meetingTypes,
    ).toEqual(custom);
  });

  it("skips a page with an unsupported duration", async () => {
    const odd = await insertPage({ durationMinutes: 20 });

    const report = await backfillMeetingTypes(mongoService.bookingPage, {
      dryRun: false,
      batchSize: 500,
    });

    expect(report.skipped).toEqual([
      { pageId: odd.toHexString(), reason: "invalid_duration" },
    ]);
    expect(report.modified).toBe(0);
  });
});
