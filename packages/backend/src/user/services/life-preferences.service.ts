import { type ObjectId } from "mongodb";
import {
  LifePreferencesResponseSchema,
  type SaveLifePreferences,
} from "@core/types/life-preferences.contracts";
import mongoService from "@backend/common/services/mongo.service";

export async function readLifePreferences(userId: ObjectId) {
  const user = await mongoService.user.findOne(
    { _id: userId },
    { projection: { lifePreferences: 1 } },
  );
  if (!user) return null;
  return LifePreferencesResponseSchema.parse(
    user.lifePreferences ?? { preferences: null, revision: 0 },
  );
}

export async function saveLifePreferences(
  userId: ObjectId,
  input: SaveLifePreferences,
) {
  const revision = input.expectedRevision;
  const updated = await mongoService.user.findOneAndUpdate(
    {
      _id: userId,
      ...(revision === null || revision === 0
        ? { lifePreferences: { $exists: false } }
        : { "lifePreferences.revision": revision }),
    },
    {
      $set: {
        lifePreferences: {
          preferences: input.preferences,
          revision: (revision ?? 0) + 1,
        },
      },
    },
    { returnDocument: "after", projection: { lifePreferences: 1 } },
  );
  if (updated)
    return {
      conflict: false,
      value: LifePreferencesResponseSchema.parse(updated.lifePreferences),
    };
  const current = await readLifePreferences(userId);
  return { conflict: revision !== null, value: current };
}
