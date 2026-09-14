import { ObjectId } from "mongodb";
import { type TimeZone } from "@core/types/domain-primitives";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { ensureBookingIndexes } from "@backend/booking/booking-indexes";
import { bookingReservationRepository } from "@backend/booking/booking-reservation.repository";
import mongoService from "@backend/common/services/mongo.service";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

const insertReservation = async (
  pageId: ObjectId,
  overrides: {
    guestName: string;
    status: "confirmed" | "cancelled";
    createdAt: Date;
    slotStart?: Date;
  },
) => {
  const slotStart =
    overrides.slotStart ?? new Date(overrides.createdAt.getTime());
  const record = await bookingReservationRepository.insert({
    _id: new ObjectId(),
    pageId,
    slotStart,
    slotEnd: new Date(slotStart.getTime() + 30 * 60 * 1000),
    guestName: overrides.guestName,
    guestEmail: "guest@example.com",
    notes: null,
    guestTimeZone: "UTC" as TimeZone,
    status: "confirmed",
    calendarEventId: "evt-1",
    cancelTokenHash: "d".repeat(64),
  });
  await mongoService.bookingReservation.updateOne(
    { _id: record._id },
    {
      $set: {
        status: overrides.status,
        createdAt: overrides.createdAt,
        updatedAt: overrides.createdAt,
      },
    },
  );
  return record;
};

describe("summarizeConfirmedCreatedSince", () => {
  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await ensureBookingIndexes();
  });
  beforeEach(cleanupCollections);
  afterAll(cleanupTestDb);

  it("returns only confirmed reservations created after since, with latest last", async () => {
    const pageId = new ObjectId();
    const since = new Date("2026-09-02T00:00:00.000Z");

    await insertReservation(pageId, {
      guestName: "Old",
      status: "confirmed",
      createdAt: new Date("2026-09-01T12:00:00.000Z"),
    });
    await insertReservation(pageId, {
      guestName: "Cancelled",
      status: "cancelled",
      createdAt: new Date("2026-09-03T12:00:00.000Z"),
    });
    await insertReservation(pageId, {
      guestName: "Later",
      status: "confirmed",
      createdAt: new Date("2026-09-04T12:00:00.000Z"),
    });
    await insertReservation(pageId, {
      guestName: "Earlier",
      status: "confirmed",
      createdAt: new Date("2026-09-03T12:00:00.000Z"),
    });
    await insertReservation(new ObjectId(), {
      guestName: "Other page",
      status: "confirmed",
      createdAt: new Date("2026-09-03T12:00:00.000Z"),
    });

    const summary =
      await bookingReservationRepository.summarizeConfirmedCreatedSince(
        pageId,
        { createdAt: since },
      );

    expect(summary.count).toBe(2);
    expect(summary.latest?.guestName).toBe("Later");
  });

  it("uses _id to claim the rest of an identical createdAt tie", async () => {
    const pageId = new ObjectId();
    const tied = new Date("2026-09-03T12:00:00.000Z");
    const first = await insertReservation(pageId, {
      guestName: "First",
      status: "confirmed",
      createdAt: tied,
      slotStart: new Date("2026-09-03T12:00:00.000Z"),
    });
    await insertReservation(pageId, {
      guestName: "Second",
      status: "confirmed",
      createdAt: tied,
      slotStart: new Date("2026-09-03T12:30:00.000Z"),
    });

    const remaining =
      await bookingReservationRepository.summarizeConfirmedCreatedSince(
        pageId,
        { createdAt: tied, reservationId: first._id },
      );

    expect(remaining.count).toBe(1);
    expect(remaining.latest?.guestName).toBe("Second");
  });
});
