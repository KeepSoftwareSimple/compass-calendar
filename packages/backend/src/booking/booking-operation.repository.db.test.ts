import { ObjectId } from "mongodb";
import { bookingOperationLifecycleTransition } from "@core/booking/booking-operation-lifecycle";
import { type TimeZone } from "@core/types/domain-primitives";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { ensureBookingIndexes } from "@backend/booking/booking-indexes";
import { bookingLifecycleAnalytics } from "@backend/booking/booking-lifecycle.analytics";
import { bookingOperationRepository } from "@backend/booking/booking-operation.repository";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
} from "bun:test";

describe("bookingOperationRepository", () => {
  let emitSpy: ReturnType<typeof spyOn>;

  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await ensureBookingIndexes();
  });
  beforeEach(() => {
    emitSpy = spyOn(
      bookingLifecycleAnalytics,
      "emitTransition",
    ).mockImplementation(() => undefined);
  });
  beforeEach(cleanupCollections);
  afterEach(() => {
    emitSpy.mockRestore();
  });
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

  it("emits accepted only on the durable insert, not on duplicate reuse", async () => {
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
    await bookingOperationRepository.insertCreate({
      ...input,
      _id: new ObjectId(),
    });
    await bookingOperationRepository.insertCreate({
      ...input,
      _id: new ObjectId(),
      reservationId: new ObjectId(),
      eventId: new ObjectId().toHexString(),
      cancelToken: "other-token",
    });
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy.mock.calls[0]?.[0]).toBeNull();
    expect(emitSpy.mock.calls[0]?.[1]).toMatchObject({
      kind: "create",
      status: "pending",
    });
  });

  it("persists the fixture matrix that maps to one capture per logical transition", async () => {
    const created = await bookingOperationRepository.insertCreate({
      _id: new ObjectId(),
      kind: "create",
      status: "pending",
      pageId: new ObjectId(),
      userId: new ObjectId(),
      calendarId: new ObjectId().toHexString(),
      eventId: new ObjectId().toHexString(),
      reservationId: new ObjectId(),
      slotStart: new Date("2026-09-14T13:00:00.000Z"),
      slotEnd: new Date("2026-09-14T13:30:00.000Z"),
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      notes: null,
      guestTimeZone: "UTC" as TimeZone,
      cancelToken: "cancel-token",
    });
    const submitted = await bookingOperationRepository.markStatus(
      created._id,
      "submitted",
    );
    const confirmed = await bookingOperationRepository.markStatus(
      created._id,
      "confirmed",
    );
    expect(bookingOperationLifecycleTransition(created, submitted!)).toEqual({
      phase: "pending",
      outcome: "success",
    });
    expect(bookingOperationLifecycleTransition(submitted!, confirmed!)).toEqual(
      { phase: "confirmed", outcome: "success" },
    );

    const retried = await bookingOperationRepository.insertCreate({
      _id: new ObjectId(),
      kind: "create",
      status: "pending",
      pageId: new ObjectId(),
      userId: new ObjectId(),
      calendarId: new ObjectId().toHexString(),
      eventId: new ObjectId().toHexString(),
      reservationId: new ObjectId(),
      slotStart: new Date("2026-09-14T14:00:00.000Z"),
      slotEnd: new Date("2026-09-14T14:30:00.000Z"),
      guestName: "Ada Lovelace",
      guestEmail: "retry@example.com",
      notes: null,
      guestTimeZone: "UTC" as TimeZone,
      cancelToken: "retry-token",
    });
    const firstRetry = await bookingOperationRepository.scheduleRetry(
      retried._id,
      new Date("2026-09-14T14:01:00.000Z"),
      "PROVIDER_FAILURE",
    );
    const secondRetry = await bookingOperationRepository.scheduleRetry(
      retried._id,
      new Date("2026-09-14T14:02:00.000Z"),
      "PROVIDER_FAILURE",
    );
    const recovered = await bookingOperationRepository.markStatus(
      retried._id,
      "confirmed",
    );
    expect(bookingOperationLifecycleTransition(retried, firstRetry!)).toEqual({
      phase: "pending",
      outcome: "provider",
      reason: "provider_failure",
    });
    expect(
      bookingOperationLifecycleTransition(firstRetry!, secondRetry!),
    ).toBeNull();
    expect(
      bookingOperationLifecycleTransition(secondRetry!, recovered!),
    ).toEqual({ phase: "recovered", outcome: "success" });

    const exhausted = await bookingOperationRepository.insertCancel({
      _id: new ObjectId(),
      kind: "cancel",
      status: "pending",
      pageId: new ObjectId(),
      userId: new ObjectId(),
      calendarId: new ObjectId().toHexString(),
      eventId: new ObjectId().toHexString(),
      reservationId: new ObjectId(),
    });
    const failed = await bookingOperationRepository.markFailed(
      exhausted._id,
      "PROVIDER_FAILURE",
    );
    expect(bookingOperationLifecycleTransition(exhausted, failed!)).toEqual({
      phase: "failed",
      outcome: "exhausted",
      reason: "retry_exhausted",
    });

    const abandoned = await bookingOperationRepository.insertReschedule({
      _id: new ObjectId(),
      kind: "reschedule",
      status: "pending",
      pageId: new ObjectId(),
      userId: new ObjectId(),
      calendarId: new ObjectId().toHexString(),
      eventId: new ObjectId().toHexString(),
      reservationId: new ObjectId(),
      slotStart: new Date("2026-09-14T15:00:00.000Z"),
      slotEnd: new Date("2026-09-14T15:30:00.000Z"),
      previousSlotStart: new Date("2026-09-14T14:00:00.000Z"),
      previousSlotEnd: new Date("2026-09-14T14:30:00.000Z"),
      guestTimeZone: "UTC" as TimeZone,
    });
    const compensated = await bookingOperationRepository.markStatus(
      abandoned._id,
      "compensated",
    );
    expect(
      bookingOperationLifecycleTransition(abandoned, compensated!),
    ).toEqual({
      phase: "compensation",
      outcome: "conflict",
      reason: "unknown",
    });
  });

  it("does not wait for capture when inserting a create operation", async () => {
    emitSpy.mockRestore();
    emitSpy = spyOn(
      bookingLifecycleAnalytics,
      "emitTransition",
    ).mockImplementation(() => {
      void new Promise(() => undefined);
    });
    const started = Date.now();
    await bookingOperationRepository.insertCreate({
      _id: new ObjectId(),
      kind: "create",
      status: "pending",
      pageId: new ObjectId(),
      userId: new ObjectId(),
      calendarId: new ObjectId().toHexString(),
      eventId: new ObjectId().toHexString(),
      reservationId: new ObjectId(),
      slotStart: new Date("2026-09-14T16:00:00.000Z"),
      slotEnd: new Date("2026-09-14T16:30:00.000Z"),
      guestName: "Ada Lovelace",
      guestEmail: "slow-capture@example.com",
      notes: null,
      guestTimeZone: "UTC" as TimeZone,
      cancelToken: "slow-token",
    });
    expect(Date.now() - started).toBeLessThan(250);
    expect(emitSpy).toHaveBeenCalledTimes(1);
  });
});
