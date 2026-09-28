import { type ObjectId } from "mongodb";
import { z } from "zod/v4";
import { zObjectId } from "@core/types/object-id.schema";
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

  async findConfirmedByCalendarEventId(
    calendarEventId: string,
  ): Promise<BookingReservationRecord | null> {
    const record = await mongoService.bookingReservation.findOne({
      calendarEventId,
      status: "confirmed",
    });
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
   * Reservations whose latest guest action is after the host notice cursor,
   * oldest-first cursor order with `_id` as the lastGuestActionAt tie-breaker.
   *
   * Count and latest come from one aggregation so a truncated in-memory
   * limit cannot skip later arrivals. The compound
   * `pageId + lastGuestActionAt + _id` index backs this match+sort.
   */
  async summarizeGuestActionsSince(
    pageId: ObjectId,
    cursor: { lastGuestActionAt: Date; reservationId?: ObjectId },
  ): Promise<{ count: number; latest: BookingReservationRecord | null }> {
    const actionAfterCursor = cursor.reservationId
      ? {
          $or: [
            { lastGuestActionAt: { $gt: cursor.lastGuestActionAt } },
            {
              lastGuestActionAt: cursor.lastGuestActionAt,
              _id: { $gt: cursor.reservationId },
            },
          ],
        }
      : { lastGuestActionAt: { $gt: cursor.lastGuestActionAt } };
    const [summary] = await mongoService.bookingReservation
      .aggregate<{ count: number; latest: BookingReservationRecord }>([
        {
          $match: {
            pageId,
            lastGuestActionAt: { $exists: true },
            ...actionAfterCursor,
          },
        },
        { $sort: { lastGuestActionAt: 1, _id: 1 } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            latest: { $last: "$$ROOT" },
          },
        },
      ])
      .toArray();
    if (!summary) {
      return { count: 0, latest: null };
    }
    return {
      count: summary.count,
      latest: BookingReservationRecordSchema.parse(summary.latest),
    };
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
        lastGuestActionAt: now,
        lastGuestAction: "booked",
        createdAt: now,
        updatedAt: now,
      });
    await mongoService.bookingReservation.insertOne(record);
    return record;
  }

  async markCancelling(id: ObjectId): Promise<BookingReservationRecord | null> {
    const now = new Date();
    const result = await mongoService.bookingReservation.findOneAndUpdate(
      { _id: id, status: "confirmed" },
      { $set: { status: "cancelling", updatedAt: now } },
      { returnDocument: "after" },
    );
    if (!result) return null;
    return BookingReservationRecordSchema.parse(result);
  }

  async markCancelled(
    id: ObjectId,
    options?: { announceGuestCancel?: boolean },
  ): Promise<BookingReservationRecord | null> {
    const now = new Date();
    const result = await mongoService.bookingReservation.findOneAndUpdate(
      { _id: id, status: { $in: ["confirmed", "cancelling"] } },
      {
        $set: {
          status: "cancelled",
          updatedAt: now,
          ...(options?.announceGuestCancel
            ? {
                lastGuestActionAt: now,
                lastGuestAction: "cancelled" as const,
              }
            : {}),
        },
      },
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
    expectedSlotStart?: Date,
    options?: {
      announceGuestReschedule?: {
        previousSlotStart: Date;
        previousSlotEnd: Date;
      };
    },
  ): Promise<BookingReservationRecord | null> {
    const now = new Date();
    const result = await mongoService.bookingReservation.findOneAndUpdate(
      {
        _id: id,
        status: "confirmed",
        ...(expectedSlotStart ? { slotStart: expectedSlotStart } : {}),
      },
      {
        $set: {
          slotStart: slot.slotStart,
          slotEnd: slot.slotEnd,
          guestTimeZone: slot.guestTimeZone,
          updatedAt: now,
          ...(options?.announceGuestReschedule
            ? {
                lastGuestActionAt: now,
                lastGuestAction: "rescheduled" as const,
                previousSlotStart:
                  options.announceGuestReschedule.previousSlotStart,
                previousSlotEnd:
                  options.announceGuestReschedule.previousSlotEnd,
              }
            : {}),
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
