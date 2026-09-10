import mongoService from "@backend/common/services/mongo.service";

export const USER_IDENTITIES_PROVIDER_SUBJECT_INDEX =
  "user_identities_provider_subject_unique";

export const HIDDEN_EVENT_USER_EVENT_INDEX = "hidden_event_user_event_unique";

export async function ensureUserIndexes(): Promise<void> {
  await mongoService.user.createIndex(
    { "identities.provider": 1, "identities.subjectId": 1 },
    {
      name: USER_IDENTITIES_PROVIDER_SUBJECT_INDEX,
      unique: true,
      partialFilterExpression: { identities: { $exists: true } },
    },
  );
  await mongoService.hiddenEvent.createIndex(
    { userId: 1, eventId: 1 },
    { name: HIDDEN_EVENT_USER_EVENT_INDEX, unique: true },
  );
}
