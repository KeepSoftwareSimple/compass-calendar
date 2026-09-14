import { ObjectId } from "mongodb";
import { type TimeZone } from "@core/types/domain-primitives";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { ensureBookingIndexes } from "@backend/booking/booking-indexes";
import { computeBookingOperationHeartbeat } from "@backend/booking/booking-lifecycle.heartbeat";
import { bookingOperationRepository } from "@backend/booking/booking-operation.repository";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

describe("computeBookingOperationHeartbeat", () => {
  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await ensureBookingIndexes();
  });
  beforeEach(cleanupCollections);
  afterAll(cleanupTestDb);

  it("emits zeros when the operation collection is empty", async () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const snapshot = await computeBookingOperationHeartbeat(now);
    expect(snapshot).toMatchObject({
      pending_count: 0,
      oldest_pending_age_ms: null,
      retry_exhausted_count: 0,
      service: "compass-backend",
    });
  });

  it("counts pending work and recent exhausted failures", async () => {
    const older = await bookingOperationRepository.insertCreate({
      _id: new ObjectId(),
      kind: "create",
      status: "pending",
      pageId: new ObjectId(),
      userId: new ObjectId(),
      calendarId: new ObjectId().toHexString(),
      eventId: new ObjectId().toHexString(),
      reservationId: new ObjectId(),
      slotStart: new Date("2026-09-14T10:00:00.000Z"),
      slotEnd: new Date("2026-09-14T10:30:00.000Z"),
      guestName: "Ada Lovelace",
      guestEmail: "older@example.com",
      notes: null,
      guestTimeZone: "UTC" as TimeZone,
      cancelToken: "older-token",
    });
    await bookingOperationRepository.insertCreate({
      _id: new ObjectId(),
      kind: "create",
      status: "pending",
      pageId: new ObjectId(),
      userId: new ObjectId(),
      calendarId: new ObjectId().toHexString(),
      eventId: new ObjectId().toHexString(),
      reservationId: new ObjectId(),
      slotStart: new Date("2026-09-14T11:00:00.000Z"),
      slotEnd: new Date("2026-09-14T11:30:00.000Z"),
      guestName: "Ada Lovelace",
      guestEmail: "newer@example.com",
      notes: null,
      guestTimeZone: "UTC" as TimeZone,
      cancelToken: "newer-token",
    });
    await bookingOperationRepository.markFailed(older._id, "PROVIDER_FAILURE");

    const now = new Date();
    const snapshot = await computeBookingOperationHeartbeat(now);
    expect(snapshot.pending_count).toBe(1);
    expect(snapshot.retry_exhausted_count).toBe(1);
    expect(snapshot.oldest_pending_age_ms).not.toBeNull();
    expect(snapshot.oldest_pending_age_ms ?? 0).toBeGreaterThanOrEqual(0);
  });
});
