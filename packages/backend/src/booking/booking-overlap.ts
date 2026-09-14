import { type ObjectId } from "mongodb";

export type OverlapOccupant = {
  _id: ObjectId;
  reservationId: ObjectId;
};

const objectIdOrder = (left: ObjectId, right: ObjectId): number =>
  left.toHexString() < right.toHexString()
    ? -1
    : left.toHexString() > right.toHexString()
      ? 1
      : 0;

/**
 * After a durable create/reschedule claim is visible, the oldest operation
 * keeps the interval. Any other confirmed reservation on the page wins
 * outright. The claimant yields when it would leave two overlapping bookings.
 */
export const shouldYieldOverlap = (args: {
  selfOperationId: ObjectId;
  selfReservationId: ObjectId;
  confirmedReservationIds: readonly ObjectId[];
  inFlight: readonly OverlapOccupant[];
}): boolean => {
  if (
    args.confirmedReservationIds.some(
      (id) => !id.equals(args.selfReservationId),
    )
  ) {
    return true;
  }
  return args.inFlight.some(
    (occupant) =>
      !occupant._id.equals(args.selfOperationId) &&
      !occupant.reservationId.equals(args.selfReservationId) &&
      objectIdOrder(occupant._id, args.selfOperationId) < 0,
  );
};
