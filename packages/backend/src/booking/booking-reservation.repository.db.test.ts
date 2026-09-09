import { ObjectId } from "mongodb";
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
  },
) => {
  const slotStart = new Date(overrides.createdAt.getTime());
  const record = await bookingReservationRepository.insert({
    _id: new ObjectId(),
    pageId,
    slotStart,
    slotEnd: new Date(slotStart.getTime() + 30 * 60 * 1000),
    guestName: overrides.guestName,
    guestEmail: "guest@example.com",
    notes: null,
    guestTimeZone: "UTC",
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
};

describe("listConfirmedCreatedSince", () => {
  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await ensureBookingIndexes();
  });
  beforeEach(cleanupCollections);
  afterAll(cleanupTestDb);

  it("returns only confirmed reservations created after since, ascending", async () => {
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

    const rows = await bookingReservationRepository.listConfirmedCreatedSince(
      pageId,
      since,
    );

    expect(rows.map((row) => row.guestName)).toEqual(["Earlier", "Later"]);
  });
});
