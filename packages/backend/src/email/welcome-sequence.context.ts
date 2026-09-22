import { type ObjectId } from "mongodb";
import { type Schema_User } from "@core/types/user.types";
import mongoService from "@backend/common/services/mongo.service";
import { type WelcomeSequenceUser } from "@backend/email/welcome-sequence";

export async function loadWelcomeSequenceUser(
  userId: ObjectId,
): Promise<(WelcomeSequenceUser & { email: string }) | null> {
  const user = await mongoService.user.findOne({ _id: userId });
  if (!user) {
    return null;
  }
  const typed = user as Schema_User & { _id: ObjectId };
  const connectedCalendar = await mongoService.calendar.findOne(
    {
      userId,
      "source.provider": { $ne: "local" },
    },
    { projection: { _id: 1 } },
  );

  return {
    email: typed.email,
    hasConnectedCalendar: connectedCalendar !== null,
    billing: typed.billing,
    emailPreferences: typed.emailPreferences,
  };
}
