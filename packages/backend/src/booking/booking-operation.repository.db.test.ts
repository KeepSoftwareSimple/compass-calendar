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

  it("reuses an in-flight reschedule instead of minting a second row", async () => {
    const reservationId = new ObjectId();
    const input = {
      kind: "reschedule" as const,
      status: "pending" as const,
      pageId: new ObjectId(),
      userId: new ObjectId(),
      calendarId: new ObjectId().toHexString(),
      eventId: new ObjectId().toHexString(),
      reservationId,
      slotStart: new Date("2026-09-14T11:00:00.000Z"),
      slotEnd: new Date("2026-09-14T11:30:00.000Z"),
      previousSlotStart: new Date("2026-09-14T10:00:00.000Z"),
      previousSlotEnd: new Date("2026-09-14T10:30:00.000Z"),
      guestTimeZone: "UTC" as TimeZone,
    };
    const first = await bookingOperationRepository.insertReschedule({
      ...input,
      _id: new ObjectId(),
    });
    const second = await bookingOperationRepository.insertReschedule({
      ...input,
      _id: new ObjectId(),
      slotStart: new Date("2026-09-14T12:00:00.000Z"),
      slotEnd: new Date("2026-09-14T12:30:00.000Z"),
    });
    expect(second._id.toHexString()).toBe(first._id.toHexString());
    expect(second.slotStart.toISOString()).toBe(first.slotStart.toISOString());
  });

  it("reuses an in-flight edit instead of minting a second row", async () => {
    const reservationId = new ObjectId();
    const input = {
      kind: "edit" as const,
      status: "pending" as const,
      pageId: new ObjectId(),
      userId: new ObjectId(),
      calendarId: new ObjectId().toHexString(),
      eventId: new ObjectId().toHexString(),
      reservationId,
      guestName: "Ada Lovelace",
      notes: "bring tea",
      cancelToken: "tok",
    };
    const first = await bookingOperationRepository.insertEdit({
      ...input,
      _id: new ObjectId(),
    });
    const second = await bookingOperationRepository.insertEdit({
      ...input,
      _id: new ObjectId(),
      notes: "bring coffee",
    });
    expect(second._id.toHexString()).toBe(first._id.toHexString());
    expect(second.notes).toBe("bring tea");
  });
});
