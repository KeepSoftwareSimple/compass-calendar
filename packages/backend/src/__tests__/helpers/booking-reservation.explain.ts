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

/** Planner for the host-notice createdAt cursor scan. */
export const explainConfirmedCreatedSinceScan = (
  pageId: ObjectId,
  since: Date,
) =>
  mongoService.bookingReservation
    .find({
      pageId,
      status: "confirmed",
      createdAt: { $gt: since },
    })
    .sort({ createdAt: 1, _id: 1 })
    .explain("queryPlanner");
