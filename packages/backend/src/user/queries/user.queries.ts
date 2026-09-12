import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { type Schema_User } from "@core/types/user.types";
import { normalizeEmail } from "@core/util/email.util";
import { hasVerifiedLoginMethod } from "@backend/auth/services/account-linking.util";
import { getIdFilter } from "@backend/common/helpers/mongo.utils";
import mongoService from "@backend/common/services/mongo.service";

type Ids_User = "email" | "_id" | "google.googleId";

export const identitiesProviderSubjectFilter = (
  provider: ProviderKind,
  subjectId: string,
) => ({
  // Repeat the partial-index predicate so Atlas will consider
  // `user_identities_provider_subject_unique`.
  identities: {
    $exists: true,
    $elemMatch: { provider, subjectId },
  },
});

function loginSubjectIds(
  user: Schema_User,
  provider: ProviderKind,
): Set<string> {
  const subjects = new Set<string>();
  for (const identity of user.identities ?? []) {
    if (identity.provider === provider) {
      subjects.add(identity.subjectId);
    }
  }
  // Legacy Google slot still counts as a google login identity until C
  // drops `google.googleId`. It is not a Microsoft or Apple subject.
  if (provider === "google" && user.google?.googleId) {
    subjects.add(user.google.googleId);
  }
  return subjects;
}

function hasConflictingLogin(
  user: Schema_User,
  provider: ProviderKind,
  subjectId: string,
): boolean {
  const subjects = loginSubjectIds(user, provider);
  return subjects.size > 0 && !subjects.has(subjectId);
}

export const findCanonicalCompassUser = async (input: {
  provider: ProviderKind;
  subjectId?: string | null;
  email?: string | null;
}) => {
  if (input.subjectId) {
    const byIdentity = await mongoService.user.findOne(
      identitiesProviderSubjectFilter(input.provider, input.subjectId),
    );
    if (byIdentity) {
      return byIdentity;
    }

    // One-release fallback: un-backfilled Google rows still key off
    // `google.googleId` only. A non-Google subject will not match.
    const byLegacyGoogleId = await findCompassUserBy(
      "google.googleId",
      input.subjectId,
    );
    if (byLegacyGoogleId) {
      return byLegacyGoogleId;
    }
  }

  if (!input.email) {
    return null;
  }

  const byEmail = await findCompassUserBy("email", normalizeEmail(input.email));
  if (!byEmail) {
    return null;
  }

  // Unverified email/password accounts link only after verification. A
  // Google or Microsoft id_token email may attach to another verified login.
  if (!hasVerifiedLoginMethod(byEmail)) {
    return null;
  }

  // Same email, different subject on the same provider: do not attach this
  // login to the existing user (fail closed).
  if (
    input.subjectId &&
    hasConflictingLogin(byEmail, input.provider, input.subjectId)
  ) {
    return null;
  }

  return byEmail;
};

export const findCompassUserBy = async (key: Ids_User, value: string) => {
  const filter = getIdFilter(key, value);
  const user = await mongoService.user.findOne(filter);

  return user;
};
