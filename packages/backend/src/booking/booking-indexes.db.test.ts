import { ObjectId } from "mongodb";
import { explainWindowedConfirmedReservationScan } from "@backend/__tests__/helpers/booking-reservation.explain";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { ensureBookingIndexes } from "@backend/booking/booking-indexes";
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
  if (Array.isArray(record["inputStages"])) {
    for (const child of record["inputStages"]) {
      indexNamesFromPlan(child, names);
    }
  }
  return names;
};

describe("booking indexes", () => {
  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await ensureBookingIndexes();
  });

  beforeEach(cleanupCollections);

  afterAll(cleanupTestDb);

  it("uses a page+slotStart index for a windowed confirmed scan, not a collection scan", async () => {
    const pageId = new ObjectId();
    const explained = await explainWindowedConfirmedReservationScan(pageId, {
      from: new Date("2026-09-07T00:00:00.000Z"),
      to: new Date("2026-09-08T00:00:00.000Z"),
    });
    const plan = (explained as { queryPlanner?: { winningPlan?: unknown } })
      .queryPlanner?.winningPlan;
    const used = indexNamesFromPlan(plan);
    expect(used.length).toBeGreaterThan(0);
    expect(
      used.some(
        (name) =>
          name === "booking_reservation_page_slot_confirmed_unique" ||
          name === "booking_reservation_page_status_slot",
      ),
    ).toBe(true);
  });
});
