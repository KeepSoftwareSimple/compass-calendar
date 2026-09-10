import { type ClientSession, type ObjectId } from "mongodb";
import { type SetEventHiddenInput } from "@core/types/event-visibility.contracts";
import mongoService from "@backend/common/services/mongo.service";

class HiddenEventService {
  listHiddenEventIds = async (
    userId: ObjectId,
    session?: ClientSession,
  ): Promise<string[]> => {
    const docs = await mongoService.hiddenEvent
      .find({ userId }, { projection: { eventId: 1 }, session })
      .sort({ createdAt: 1 })
      .toArray();

    return docs.map((doc) => doc.eventId);
  };

  setEventHidden = async (
    userId: ObjectId,
    input: SetEventHiddenInput,
  ): Promise<string[]> => {
    const { eventId, hidden } = input;

    if (hidden) {
      await mongoService.hiddenEvent.updateOne(
        { userId, eventId },
        {
          $setOnInsert: {
            _id: mongoService.objectId(),
            userId,
            eventId,
            createdAt: new Date(),
          },
        },
        { upsert: true },
      );
    } else {
      await mongoService.hiddenEvent.deleteOne({ userId, eventId });
    }

    return this.listHiddenEventIds(userId);
  };

  deleteAllByUser = async (userId: ObjectId, session?: ClientSession) => {
    return mongoService.hiddenEvent.deleteMany({ userId }, { session });
  };
}

export default new HiddenEventService();
