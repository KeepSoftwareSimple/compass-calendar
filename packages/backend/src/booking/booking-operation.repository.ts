import { type ObjectId } from "mongodb";
import { z } from "zod/v4";
import { zObjectId } from "@core/types/object-id.schema";
import { isDuplicateKeyError } from "@core/util/mongo-duplicate-key.util";
import { bookingLifecycleAnalytics } from "@backend/booking/booking-lifecycle.analytics";
import {
  BOOKING_OPERATION_IN_FLIGHT_STATUSES,
  BOOKING_OPERATION_RECOVERABLE_STATUSES,
  type BookingOperationRecord,
  BookingOperationRecordSchema,
  type BookingOperationStatus,
  type CancelBookingOperationRecord,
  CancelBookingOperationRecordSchema,
  type CreateBookingOperationRecord,
  CreateBookingOperationRecordSchema,
  type EditBookingOperationRecord,
  EditBookingOperationRecordSchema,
  type RescheduleBookingOperationRecord,
  RescheduleBookingOperationRecordSchema,
} from "@backend/booking/booking-operation.record";
import mongoService from "@backend/common/services/mongo.service";

/**
 * What a caller supplies for a new operation: the operation's own fields,
 * minus the retry bookkeeping and timestamps this repository owns. The three
 * retry fields stay optional so a test or a recovery path can seed them.
 */
type InsertBookingOperationInput<T extends BookingOperationRecord> = Omit<
  T,
  "createdAt" | "updatedAt" | "attemptCount" | "nextAttemptAt" | "lastError"
> & {
  attemptCount?: number;
  nextAttemptAt?: Date;
  lastError?: string | null;
};

export type InsertCreateBookingOperationInput =
  InsertBookingOperationInput<CreateBookingOperationRecord>;

export type InsertCancelBookingOperationInput =
  InsertBookingOperationInput<CancelBookingOperationRecord>;

export type InsertRescheduleBookingOperationInput =
  InsertBookingOperationInput<RescheduleBookingOperationRecord>;

export type InsertEditBookingOperationInput =
  InsertBookingOperationInput<EditBookingOperationRecord>;

const parseOperation = (record: unknown): BookingOperationRecord =>
  BookingOperationRecordSchema.parse(record);

const OverlapClaimRowSchema = z.object({
  _id: zObjectId,
  reservationId: zObjectId,
  kind: z.enum(["create", "reschedule"]),
});

class BookingOperationRepository {
  /**
   * Insert an operation, or hand back the one that won the race.
   *
   * Every kind fills the same retry bookkeeping and emits the same opening
   * transition; they differ only in which unique index can reject the insert
   * and therefore how the winner is found again, which is what `findWinner`
   * supplies. A winner of another kind is not an answer to this insert, so the
   * duplicate-key error is rethrown instead.
   */
  private async insertOperation<T extends BookingOperationRecord>(
    schema: z.ZodType<T>,
    input: InsertBookingOperationInput<T>,
    findWinner: (record: T) => Promise<BookingOperationRecord | null>,
  ): Promise<T> {
    const now = new Date();
    const record = schema.parse({
      ...input,
      attemptCount: input.attemptCount ?? 0,
      nextAttemptAt: input.nextAttemptAt ?? now,
      lastError: input.lastError ?? null,
      createdAt: now,
      updatedAt: now,
    });
    try {
      await mongoService.bookingOperation.insertOne(record);
      bookingLifecycleAnalytics.emitTransition(null, record);
      return record;
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      const winner = await findWinner(record);
      if (winner?.kind === record.kind) {
        return winner as T;
      }
      throw error;
    }
  }

  async insertCreate(
    input: InsertCreateBookingOperationInput,
  ): Promise<CreateBookingOperationRecord> {
    return this.insertOperation(
      CreateBookingOperationRecordSchema,
      input,
      async (record) =>
        (await this.findActiveCreateByIntent(
          record.pageId,
          record.slotStart,
          record.guestEmail,
        )) ?? this.findCreateByReservationId(record.reservationId),
    );
  }

  async insertCancel(
    input: InsertCancelBookingOperationInput,
  ): Promise<CancelBookingOperationRecord> {
    return this.insertOperation(
      CancelBookingOperationRecordSchema,
      input,
      (record) =>
        this.findByReservationIdAndKind(record.reservationId, "cancel"),
    );
  }

  async insertReschedule(
    input: InsertRescheduleBookingOperationInput,
  ): Promise<RescheduleBookingOperationRecord> {
    return this.insertOperation(
      RescheduleBookingOperationRecordSchema,
      input,
      (record) => this.findInFlightByReservationId(record.reservationId),
    );
  }

  async insertEdit(
    input: InsertEditBookingOperationInput,
  ): Promise<EditBookingOperationRecord> {
    return this.insertOperation(
      EditBookingOperationRecordSchema,
      input,
      (record) => this.findInFlightByReservationId(record.reservationId),
    );
  }

  async findById(id: ObjectId): Promise<BookingOperationRecord | null> {
    const record = await mongoService.bookingOperation.findOne({ _id: id });
    if (!record) return null;
    return parseOperation(record);
  }

  async findActiveCreateByIntent(
    pageId: ObjectId,
    slotStart: Date,
    guestEmail: string,
  ): Promise<CreateBookingOperationRecord | null> {
    const record = await mongoService.bookingOperation.findOne({
      kind: "create",
      pageId,
      slotStart,
      guestEmail,
      status: { $in: [...BOOKING_OPERATION_IN_FLIGHT_STATUSES] },
    });
    if (!record) return null;
    return CreateBookingOperationRecordSchema.parse(record);
  }

  async findCreateByReservationId(
    reservationId: ObjectId,
  ): Promise<CreateBookingOperationRecord | null> {
    const record = await mongoService.bookingOperation.findOne({
      kind: "create",
      reservationId,
    });
    if (!record) return null;
    return CreateBookingOperationRecordSchema.parse(record);
  }

  async findInFlightByReservationId(
    reservationId: ObjectId,
  ): Promise<BookingOperationRecord | null> {
    const record = await mongoService.bookingOperation.findOne({
      reservationId,
      kind: { $in: ["reschedule", "cancel", "edit"] },
      status: { $in: [...BOOKING_OPERATION_RECOVERABLE_STATUSES] },
    });
    if (!record) return null;
    return parseOperation(record);
  }

  async listInFlightOverlapping(
    pageId: ObjectId,
    slotStart: Date,
    slotEnd: Date,
  ): Promise<
    Array<{
      _id: ObjectId;
      reservationId: ObjectId;
      kind: "create" | "reschedule";
    }>
  > {
    const rows = await mongoService.bookingOperation
      .find({
        pageId,
        kind: { $in: ["create", "reschedule"] },
        status: { $in: [...BOOKING_OPERATION_IN_FLIGHT_STATUSES] },
        slotStart: { $lt: slotEnd },
        slotEnd: { $gt: slotStart },
      })
      .project({ reservationId: 1, kind: 1 })
      .toArray();
    return rows.map((row) => OverlapClaimRowSchema.parse(row));
  }

  async findByReservationIdAndKind(
    reservationId: ObjectId,
    kind: BookingOperationRecord["kind"],
  ): Promise<BookingOperationRecord | null> {
    const record = await mongoService.bookingOperation.findOne({
      reservationId,
      kind,
    });
    if (!record) return null;
    return parseOperation(record);
  }

  /**
   * Apply a field update and report the resulting lifecycle transition.
   *
   * The pre-image is read first because the analytics stream is a transition,
   * not a state: an operation that vanished between the read and the write has
   * no transition to emit, and answers null like any other missing record.
   */
  private async updateAndEmit(
    id: ObjectId,
    $set: Partial<BookingOperationRecord> & { updatedAt: Date },
  ): Promise<BookingOperationRecord | null> {
    const previous = await this.findById(id);
    const result = await mongoService.bookingOperation.findOneAndUpdate(
      { _id: id },
      { $set },
      { returnDocument: "after" },
    );
    if (!result) return null;
    const current = parseOperation(result);
    if (previous) {
      bookingLifecycleAnalytics.emitTransition(previous, current);
    }
    return current;
  }

  async markStatus(
    id: ObjectId,
    status: BookingOperationStatus,
    patch: { lastError?: string | null; nextAttemptAt?: Date } = {},
  ): Promise<BookingOperationRecord | null> {
    const $set: {
      status: BookingOperationStatus;
      updatedAt: Date;
      lastError?: string | null;
      nextAttemptAt?: Date;
    } = { status, updatedAt: new Date() };
    if (patch.lastError !== undefined) {
      $set.lastError = patch.lastError;
    }
    if (patch.nextAttemptAt) {
      $set.nextAttemptAt = patch.nextAttemptAt;
    }
    return this.updateAndEmit(id, $set);
  }

  async scheduleRetry(
    id: ObjectId,
    nextAttemptAt: Date,
    lastError: string | null,
  ): Promise<BookingOperationRecord | null> {
    return this.updateAndEmit(id, {
      nextAttemptAt,
      lastError,
      updatedAt: new Date(),
    });
  }

  async markFailed(
    id: ObjectId,
    lastError: string | null,
  ): Promise<BookingOperationRecord | null> {
    return this.markStatus(id, "failed", {
      lastError,
      nextAttemptAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });
  }

  async claimDue(
    limit: number,
    leaseUntil: Date,
  ): Promise<BookingOperationRecord[]> {
    const now = new Date();
    const claimed: BookingOperationRecord[] = [];
    for (let index = 0; index < limit; index += 1) {
      const result = await mongoService.bookingOperation.findOneAndUpdate(
        {
          status: { $in: [...BOOKING_OPERATION_RECOVERABLE_STATUSES] },
          nextAttemptAt: { $lte: now },
        },
        {
          $set: { nextAttemptAt: leaseUntil, updatedAt: now },
          $inc: { attemptCount: 1 },
        },
        { sort: { nextAttemptAt: 1 }, returnDocument: "after" },
      );
      if (!result) {
        break;
      }
      claimed.push(parseOperation(result));
    }
    return claimed;
  }
}

export const bookingOperationRepository = new BookingOperationRepository();
