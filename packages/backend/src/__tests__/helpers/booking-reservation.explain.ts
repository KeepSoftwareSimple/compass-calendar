import { type ObjectId } from "mongodb";
import mongoService from "@backend/common/services/mongo.service";

/** Planner for the windowed confirmed scan occupancy queries use. */
export const explainWindowedConfirmedReservationScan = (
  pageId: ObjectId,
  range: { from: Date; to: Date },
) =>
  mongoService.bookingReservation
    .find({
      pageId,
      status: "confirmed",
      slotStart: { $gte: range.from, $lt: range.to },
    })
    .explain("queryPlanner");

/** Planner for the host-notice lastGuestActionAt cursor scan. */
export const explainGuestActionsSinceScan = (pageId: ObjectId, since: Date) =>
  mongoService.bookingReservation
    .find({
      pageId,
      lastGuestActionAt: { $exists: true, $gt: since },
    })
    .sort({ lastGuestActionAt: 1, _id: 1 })
    .explain("queryPlanner");
