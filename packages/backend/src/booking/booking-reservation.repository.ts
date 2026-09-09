import { type ObjectId } from "mongodb";
import { z } from "zod/v4";
import { zObjectId } from "@core/types/type.utils";
import {
  type BookingReservationRecord,
  BookingReservationRecordSchema,
} from "@backend/booking/booking-reservation.record";
import mongoService from "@backend/common/services/mongo.service";

// Projected reads must not use the strict record schema: a projection drops
// fields the strict parse requires, so it would throw on every stored row.
const ConfirmedSlotRowSchema = z.object({
  _id: zObjectId,
  slotStart: z.date(),
});

/**
 * Half-open [from, to) of `slotStart` values the slot engine can still see.
 *
 * Reservations ending after `windowStart` or starting before `windowEnd` can
 * block a candidate slot, so the range extends one meeting duration before
 * the window.
 */
export const confirmedReservationScanRange = (
  page: { durationMinutes: number },
  windowStart: Date,
  windowEnd: Date,
): { from: Date; to: Date } => {
  const durationMs = page.durationMinutes * 60_000;
  return {
    from: new Date(windowStart.getTime() - durationMs),
    to: windowEnd,
  };
};

export type InsertBookingReservationInput = Omit<
  BookingReservationRecord,
  "createdAt" | "updatedAt"
> & { _id: ObjectId };

class BookingReservationRepository {
  async findById(id: ObjectId): Promise<BookingReservationRecord | null> {
    const record = await mongoService.bookingReservation.findOne({ _id: id });
    if (!record) return null;
    return BookingReservationRecordSchema.parse(record);
  }

  async listConfirmedStartsByPageId(
    pageId: ObjectId,
    range: { from: Date; to: Date },
  ): Promise<Date[]> {
    const rows = await mongoService.bookingReservation
      .find({
        pageId,
        status: "confirmed",
        slotStart: { $gte: range.from, $lt: range.to },
      })
      .project({ slotStart: 1 })
      .toArray();
    return rows.map((row) => ConfirmedSlotRowSchema.parse(row).slotStart);
  }

  /**
   * Confirmed rows created after `since`, oldest first.
   *
   * No dedicated `createdAt` index: `{ pageId, status, slotStart }` already
   * serves the `{ pageId, status }` prefix, and reservations per page are
   * few. Always state `status: "confirmed"` so the partial unique sibling
   * can also apply.
   */
  async listConfirmedCreatedSince(
    pageId: ObjectId,
    since: Date,
    limit = 20,
  ): Promise<BookingReservationRecord[]> {
    const rows = await mongoService.bookingReservation
      .find({
        pageId,
        status: "confirmed",
        createdAt: { $gt: since },
      })
      .sort({ createdAt: 1 })
      .limit(limit)
      .toArray();
    return rows.map((row) => BookingReservationRecordSchema.parse(row));
  }

  async listConfirmedOverlapping(
    pageId: ObjectId,
    slotStart: Date,
    slotEnd: Date,
  ): Promise<ObjectId[]> {
    const rows = await mongoService.bookingReservation
      .find({
        pageId,
        status: "confirmed",
        slotStart: { $lt: slotEnd },
        slotEnd: { $gt: slotStart },
      })
      .project({ slotStart: 1 })
      .toArray();
    return rows.map((row) => ConfirmedSlotRowSchema.parse(row)._id);
  }

  async deleteById(id: ObjectId): Promise<void> {
    await mongoService.bookingReservation.deleteOne({ _id: id });
  }

  async insert(
    input: InsertBookingReservationInput,
  ): Promise<BookingReservationRecord> {
    const now = new Date();
    const record: BookingReservationRecord =
      BookingReservationRecordSchema.parse({
        ...input,
        createdAt: now,
        updatedAt: now,
      });
    await mongoService.bookingReservation.insertOne(record);
    return record;
  }

  async markCancelled(id: ObjectId): Promise<BookingReservationRecord | null> {
    const now = new Date();
    const result = await mongoService.bookingReservation.findOneAndUpdate(
      { _id: id, status: "confirmed" },
      { $set: { status: "cancelled", updatedAt: now } },
      { returnDocument: "after" },
    );
    if (!result) return null;
    return BookingReservationRecordSchema.parse(result);
  }

  async updateGuestDetails(
    id: ObjectId,
    details: { guestName: string; notes: string | null },
  ): Promise<BookingReservationRecord | null> {
    const now = new Date();
    const result = await mongoService.bookingReservation.findOneAndUpdate(
      { _id: id, status: "confirmed" },
      {
        $set: {
          guestName: details.guestName,
          notes: details.notes,
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );
    if (!result) return null;
    return BookingReservationRecordSchema.parse(result);
  }

  async updateSlotTimes(
    id: ObjectId,
    slot: {
      slotStart: Date;
      slotEnd: Date;
      guestTimeZone: BookingReservationRecord["guestTimeZone"];
    },
  ): Promise<BookingReservationRecord | null> {
    const now = new Date();
    const result = await mongoService.bookingReservation.findOneAndUpdate(
      { _id: id, status: "confirmed" },
      {
        $set: {
          slotStart: slot.slotStart,
          slotEnd: slot.slotEnd,
          guestTimeZone: slot.guestTimeZone,
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );
    if (!result) return null;
    return BookingReservationRecordSchema.parse(result);
  }

  async clearCalendarEventId(
    id: ObjectId,
  ): Promise<BookingReservationRecord | null> {
    const now = new Date();
    const result = await mongoService.bookingReservation.findOneAndUpdate(
      { _id: id },
      { $set: { calendarEventId: null, updatedAt: now } },
      { returnDocument: "after" },
    );
    if (!result) return null;
    return BookingReservationRecordSchema.parse(result);
  }
}

export const bookingReservationRepository = new BookingReservationRepository();
