import { ObjectId } from "mongodb";
import { type TimeZone } from "@core/types/domain-primitives";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { ensureBookingIndexes } from "@backend/booking/booking-indexes";
import { bookingOperationRepository } from "@backend/booking/booking-operation.repository";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

describe("bookingOperationRepository", () => {
  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await ensureBookingIndexes();
  });
  beforeEach(cleanupCollections);
  afterAll(cleanupTestDb);

  it("reuses an in-flight create intent instead of minting a second row", async () => {
    const pageId = new ObjectId();
    const slotStart = new Date("2026-09-14T10:00:00.000Z");
    const input = {
      kind: "create" as const,
      status: "pending" as const,
      pageId,
      userId: new ObjectId(),
      calendarId: new ObjectId().toHexString(),
      eventId: new ObjectId().toHexString(),
      reservationId: new ObjectId(),
      slotStart,
      slotEnd: new Date("2026-09-14T10:30:00.000Z"),
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      notes: null,
      guestTimeZone: "UTC" as TimeZone,
      cancelToken: "cancel-token",
    };
    const first = await bookingOperationRepository.insertCreate({
      ...input,
      _id: new ObjectId(),
    });
    const second = await bookingOperationRepository.insertCreate({
      ...input,
      _id: new ObjectId(),
      reservationId: new ObjectId(),
      eventId: new ObjectId().toHexString(),
      cancelToken: "other-token",
    });
    expect(second._id.toHexString()).toBe(first._id.toHexString());
    expect(second.eventId).toBe(first.eventId);
    expect(second.cancelToken).toBe(first.cancelToken);
  });
});
