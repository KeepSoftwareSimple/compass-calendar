import { type ObjectId } from "mongodb";
import {
  type HostGuestRsvpNoticeStateRecord,
  HostGuestRsvpNoticeStateRecordSchema,
} from "@backend/booking/host-guest-rsvp-notice.record";
import mongoService from "@backend/common/services/mongo.service";

class HostGuestRsvpNoticeRepository {
  async findOrCreate(
    userId: ObjectId,
  ): Promise<HostGuestRsvpNoticeStateRecord> {
    const existing = await mongoService.hostGuestRsvpNoticeState.findOne({
      userId,
    });
    if (existing) {
      return HostGuestRsvpNoticeStateRecordSchema.parse(existing);
    }

    const now = new Date();
    const result = await mongoService.hostGuestRsvpNoticeState.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: {
          _id: mongoService.objectId(),
          userId,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (!result) {
      throw new Error("Failed to upsert host guest RSVP notice state");
    }
    return HostGuestRsvpNoticeStateRecordSchema.parse(result);
  }

  async stampNoticedAt(
    userId: ObjectId,
    expected: { at?: Date; observationId?: ObjectId },
    next: { at: Date; observationId: ObjectId },
  ): Promise<boolean> {
    if (
      expected.observationId !== undefined &&
      next.observationId.equals(expected.observationId)
    ) {
      return false;
    }

    const filter =
      expected.at === undefined
        ? { userId, noticedAt: { $exists: false } }
        : expected.observationId
          ? {
              userId,
              noticedAt: expected.at,
              noticedObservationId: expected.observationId,
            }
          : {
              userId,
              noticedAt: expected.at,
              noticedObservationId: { $exists: false },
            };

    const result = await mongoService.hostGuestRsvpNoticeState.findOneAndUpdate(
      filter,
      {
        $set: {
          noticedAt: next.at,
          noticedObservationId: next.observationId,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    );
    return result !== null;
  }
}

export const hostGuestRsvpNoticeRepository =
  new HostGuestRsvpNoticeRepository();
