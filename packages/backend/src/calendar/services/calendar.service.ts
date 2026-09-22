import { type ClientSession, ObjectId } from "mongodb";
import { zObjectId } from "@core/types/object-id.schema";
import { CalendarRecordSchema } from "@backend/calendar/calendar.record";
import mongoService from "@backend/common/services/mongo.service";

class CalendarService {
  /**
   * Get every calendar record owned by a user.
   *
   * Takes an optional session so a caller deleting inside a transaction reads
   * the same snapshot it is writing to, rather than the committed state.
   */
  list = async (userId: ObjectId | string, session?: ClientSession) => {
    return mongoService.calendar
      .find({ userId: zObjectId.parse(userId) }, { session })
      .toArray();
  };

  /**
   * The user's single Compass-local calendar: where password-only /
   * locally-owned scheduled events (never backed by Google) live.
   */
  getLocalCalendar = async (userId: ObjectId | string) => {
    return mongoService.calendar.findOne({
      userId: zObjectId.parse(userId),
      "source.provider": "local",
    });
  };

  /**
   * Gives the user the local calendar getLocalCalendar reads. Nothing else
   * creates it: Google discovery only writes google-sourced calendars, so
   * without this a password-only account owns no calendar at all and every
   * write fails CALENDAR_NOT_FOUND. syncLocalEventsToCloud needs it too - it
   * maps the browser's sentinel calendar onto this one when a user who has
   * been working anonymously signs in.
   *
   * Upserts on the same {userId, source.provider} the
   * calendar_userId_local_unique partial index covers, so two concurrent
   * calls can't leave the user with two.
   */
  ensureLocalCalendar = async (
    userId: ObjectId | string,
    session?: ClientSession,
  ) => {
    const userObjectId = zObjectId.parse(userId);

    await mongoService.calendar.updateOne(
      { userId: userObjectId, "source.provider": "local" },
      {
        $setOnInsert: CalendarRecordSchema.parse({
          _id: new ObjectId(),
          userId: userObjectId,
          name: "Compass",
          description: "",
          timeZone: null,
          foregroundColor: "#000000",
          backgroundColor: "#ffffff",
          access: "owner",
          // A connected Google account's primary calendar keeps that role;
          // getDefaultTargetCalendar falls back to this one when there
          // isn't one.
          isPrimary: false,
          isVisible: true,
          isActive: true,
          source: { provider: "local" },
          createdAt: new Date(),
          updatedAt: null,
        }),
      },
      { upsert: true, session },
    );
  };

  /**
   * Delete all calendars for a user.
   */
  async deleteAllByUser(userId: ObjectId | string, session?: ClientSession) {
    return mongoService.calendar.deleteMany(
      { userId: zObjectId.parse(userId) },
      { session },
    );
  }
}

export default new CalendarService();
