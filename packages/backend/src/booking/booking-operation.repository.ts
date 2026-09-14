import { type ObjectId } from "mongodb";
import { z } from "zod/v4";
import { zObjectId } from "@core/types/type.utils";
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

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === 11000;

export type InsertCreateBookingOperationInput = Omit<
  CreateBookingOperationRecord,
  "createdAt" | "updatedAt" | "attemptCount" | "nextAttemptAt" | "lastError"
> & {
  attemptCount?: number;
  nextAttemptAt?: Date;
  lastError?: string | null;
};

export type InsertCancelBookingOperationInput = Omit<
  CancelBookingOperationRecord,
  "createdAt" | "updatedAt" | "attemptCount" | "nextAttemptAt" | "lastError"
> & {
  attemptCount?: number;
  nextAttemptAt?: Date;
  lastError?: string | null;
};

export type InsertRescheduleBookingOperationInput = Omit<
  RescheduleBookingOperationRecord,
  "createdAt" | "updatedAt" | "attemptCount" | "nextAttemptAt" | "lastError"
> & {
  attemptCount?: number;
  nextAttemptAt?: Date;
  lastError?: string | null;
};

export type InsertEditBookingOperationInput = Omit<
  EditBookingOperationRecord,
  "createdAt" | "updatedAt" | "attemptCount" | "nextAttemptAt" | "lastError"
> & {
  attemptCount?: number;
  nextAttemptAt?: Date;
  lastError?: string | null;
};

const parseOperation = (record: unknown): BookingOperationRecord =>
  BookingOperationRecordSchema.parse(record);

const OverlapClaimRowSchema = z.object({
  _id: zObjectId,
  reservationId: zObjectId,
  kind: z.enum(["create", "reschedule"]),
});

class BookingOperationRepository {
  async insertCreate(
    input: InsertCreateBookingOperationInput,
  ): Promise<CreateBookingOperationRecord> {
    const now = new Date();
    const record = CreateBookingOperationRecordSchema.parse({
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
      const existing = await this.findActiveCreateByIntent(
        record.pageId,
        record.slotStart,
        record.guestEmail,
      );
      if (existing) {
        return existing;
      }
      const byReservation = await this.findCreateByReservationId(
        record.reservationId,
      );
      if (byReservation) {
        return byReservation;
      }
      throw error;
    }
  }

  async insertCancel(
    input: InsertCancelBookingOperationInput,
  ): Promise<CancelBookingOperationRecord> {
    const now = new Date();
    const record = CancelBookingOperationRecordSchema.parse({
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
      const existing = await this.findByReservationIdAndKind(
        record.reservationId,
        "cancel",
      );
      if (existing?.kind === "cancel") {
        return existing;
      }
      throw error;
    }
  }

  async insertReschedule(
    input: InsertRescheduleBookingOperationInput,
  ): Promise<RescheduleBookingOperationRecord> {
    const now = new Date();
    const record = RescheduleBookingOperationRecordSchema.parse({
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
      const existing = await this.findInFlightByReservationId(
        record.reservationId,
      );
      if (existing?.kind === "reschedule") {
        return existing;
      }
      throw error;
    }
  }

  async insertEdit(
    input: InsertEditBookingOperationInput,
  ): Promise<EditBookingOperationRecord> {
    const now = new Date();
    const record = EditBookingOperationRecordSchema.parse({
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
      const existing = await this.findInFlightByReservationId(
        record.reservationId,
      );
      if (existing?.kind === "edit") {
        return existing;
      }
      throw error;
    }
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

  async markStatus(
    id: ObjectId,
    status: BookingOperationStatus,
    patch: { lastError?: string | null; nextAttemptAt?: Date } = {},
  ): Promise<BookingOperationRecord | null> {
    const now = new Date();
    const $set: {
      status: BookingOperationStatus;
      updatedAt: Date;
      lastError?: string | null;
      nextAttemptAt?: Date;
    } = { status, updatedAt: now };
    if (patch.lastError !== undefined) {
      $set.lastError = patch.lastError;
    }
    if (patch.nextAttemptAt) {
      $set.nextAttemptAt = patch.nextAttemptAt;
    }
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

  async scheduleRetry(
    id: ObjectId,
    nextAttemptAt: Date,
    lastError: string | null,
  ): Promise<BookingOperationRecord | null> {
    const now = new Date();
    const $set = {
      nextAttemptAt,
      lastError,
      updatedAt: now,
    };
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
