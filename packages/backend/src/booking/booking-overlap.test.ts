import { ObjectId } from "mongodb";
import { shouldYieldOverlap } from "@backend/booking/booking-overlap";
import { describe, expect, it } from "bun:test";

describe("shouldYieldOverlap", () => {
  const selfOperationId = new ObjectId("aaaaaaaaaaaaaaaaaaaaaaaa");
  const selfReservationId = new ObjectId("bbbbbbbbbbbbbbbbbbbbbbbb");
  const olderOperationId = new ObjectId("000000000000000000000001");
  const newerOperationId = new ObjectId("ffffffffffffffffffffffff");
  const otherReservationId = new ObjectId("cccccccccccccccccccccccc");

  it("keeps the claim when nothing else occupies the interval", () => {
    expect(
      shouldYieldOverlap({
        selfOperationId,
        selfReservationId,
        confirmedReservationIds: [selfReservationId],
        inFlight: [{ _id: selfOperationId, reservationId: selfReservationId }],
      }),
    ).toBe(false);
  });

  it("yields to another confirmed reservation", () => {
    expect(
      shouldYieldOverlap({
        selfOperationId,
        selfReservationId,
        confirmedReservationIds: [selfReservationId, otherReservationId],
        inFlight: [],
      }),
    ).toBe(true);
  });

  it("yields to an older in-flight claim", () => {
    expect(
      shouldYieldOverlap({
        selfOperationId,
        selfReservationId,
        confirmedReservationIds: [],
        inFlight: [
          { _id: olderOperationId, reservationId: otherReservationId },
        ],
      }),
    ).toBe(true);
  });

  it("keeps the claim against a newer in-flight rival", () => {
    expect(
      shouldYieldOverlap({
        selfOperationId,
        selfReservationId,
        confirmedReservationIds: [],
        inFlight: [
          { _id: newerOperationId, reservationId: otherReservationId },
        ],
      }),
    ).toBe(false);
  });

  it("does not yield to an older in-flight claim for the same reservation", () => {
    expect(
      shouldYieldOverlap({
        selfOperationId,
        selfReservationId,
        confirmedReservationIds: [],
        inFlight: [{ _id: olderOperationId, reservationId: selfReservationId }],
      }),
    ).toBe(false);
  });
});
