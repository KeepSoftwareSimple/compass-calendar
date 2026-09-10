import { type TokenPayload } from "google-auth-library";
import { type ClientSession, ObjectId, type WithId } from "mongodb";
import { Logger } from "@core/logger/winston.logger";
import {
  mapUserToCompass,
  mergeGoogleLoginIdentity,
  mergeLoginIdentities,
} from "@core/mappers/map.user";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { zObjectId } from "@core/types/type.utils";
import {
  type Schema_User,
  type Schema_UserIdentity,
  type UserProfile,
} from "@core/types/user.types";
import { canReuseCompassUserByEmail } from "@backend/auth/services/account-linking.util";
import compassAuthService from "@backend/auth/services/compass/compass.auth.service";
import supertokensUserCleanupService from "@backend/auth/services/supertokens/supertokens.user-cleanup.service";
import stripeService from "@backend/billing/services/stripe.service";
import calendarService from "@backend/calendar/services/calendar.service";
import { Collections } from "@backend/common/constants/collections";
import { error } from "@backend/common/errors/handlers/error.handler";
import { UserError } from "@backend/common/errors/user/user.errors";
import { normalizeEmail } from "@backend/common/helpers/email.util";
import mongoService from "@backend/common/services/mongo.service";
import { toSyncPrincipal } from "@backend/common/services/sync-service/sync-principal";
import { getSyncServiceClient } from "@backend/common/services/sync-service/sync-service.factory";
import eventService from "@backend/event/services/event.service";
import { findCanonicalCompassUser } from "@backend/user/queries/user.queries";
import hiddenEventService from "@backend/user/services/hidden-event.service";
import { type Summary_Delete } from "@backend/user/types/user.types";

const logger = Logger("app:user.service");
const ACCOUNT_DELETION_RETRY_INTERVAL_MS = 10 * 60_000;
const ACCOUNT_DELETION_RETRY_BATCH_SIZE = 100;

type LegacyPendingSyncPrincipalDeletionRecord = {
  _id: string;
  requestedAt: Date;
  lastAttemptAt: Date;
  attempts: number;
};

/**
 * Manages user data and metadata.
 */
class UserService {
  #accountDeletionRetryTimer: ReturnType<typeof setInterval> | undefined;
  #pendingRetryCycle: Promise<void> | undefined;

  private splitName(name: string): { firstName: string; lastName: string } {
    const trimmedName = name.trim();
    const [firstName = "Mystery", ...rest] = trimmedName.split(/\s+/);
    const lastName = rest.join(" ") || "Person";

    return { firstName, lastName };
  }

  createUser = async (
    gUser: TokenPayload,
    userId: string = new ObjectId().toString(),
    session?: ClientSession,
  ): Promise<Schema_User & { userId: string }> => {
    const _compassUser = mapUserToCompass(gUser);
    const _id = zObjectId.parse(userId, { error: () => "Invalid user ID" });
    const now = new Date();
    const compassUser = {
      ..._compassUser,
      _id,
      signedUpAt: now,
      lastLoggedInAt: now,
    };

    const user = await mongoService.user.insertOne(compassUser, { session });

    const newUserId = zObjectId.parse(user.insertedId.toString(), {
      error: () => "Failed to create Compass user",
    });

    return {
      ...compassUser,
      userId: newUserId.toString(),
    };
  };

  getProfile = async (
    _id: ObjectId,
    session?: ClientSession,
  ): Promise<UserProfile> => {
    const user = await mongoService.user.findOne(
      { _id },
      {
        session,
        projection: {
          userId: { $toString: "$_id" },
          picture: "$google.picture",
          firstName: 1,
          lastName: 1,
          name: 1,
          email: 1,
          locale: 1,
        },
      },
    );

    if (!user)
      throw error(UserError.UserNotFound, "Failed to return user profile");

    return {
      ...(user as unknown as UserProfile),
      picture: (user as { picture?: string }).picture ?? "",
    };
  };

  getCanonicalCompassUserId = async (input: {
    provider: ProviderKind;
    subjectId?: string | null;
    email?: string | null;
  }): Promise<string | null> => {
    const user = await findCanonicalCompassUser(input);
    return user?._id.toString() ?? null;
  };

  upsertUserFromAuth = async (
    input: {
      userId: string;
      email: string;
      name?: string;
      locale?: string;
      google?: Schema_User["google"];
      identities?: Schema_UserIdentity[];
    },
    session?: ClientSession,
  ): Promise<{
    user: Schema_User & { userId: string };
    isNewUser: boolean;
  }> => {
    const requestedUserId = zObjectId.parse(input.userId, {
      error: () => "Invalid user ID",
    });
    const email = normalizeEmail(input.email);
    const incomingHasVerifiedLogin =
      Boolean(input.google?.googleId) || (input.identities?.length ?? 0) > 0;
    const existingUserByEmailMatch = await mongoService.user.findOne(
      { email },
      { session },
    );
    const existingUserByEmail =
      existingUserByEmailMatch &&
      canReuseCompassUserByEmail({
        existing: existingUserByEmailMatch,
        incomingHasVerifiedLogin,
      })
        ? existingUserByEmailMatch
        : null;
    const existingUser =
      existingUserByEmail ??
      (await mongoService.user.findOne({ _id: requestedUserId }, { session }));
    const userId = existingUser?._id ?? requestedUserId;

    const isNewUser = !existingUser;
    const name = input.name?.trim() || existingUser?.name || "Mystery Person";
    const { firstName, lastName } = this.splitName(name);
    const locale = input.locale ?? existingUser?.locale ?? "not provided";
    const signedUpAt = existingUser?.signedUpAt ?? new Date();

    // Preserve existing Google data, but allow override from input
    const google = input.google ?? existingUser?.google;
    const identities = mergeLoginIdentities(
      mergeGoogleLoginIdentity(existingUser?.identities, google, email, name),
      input.identities,
    );

    const nextUser: Schema_User = {
      email,
      name,
      firstName,
      lastName,
      locale,
      signedUpAt,
      lastLoggedInAt: new Date(),
      ...(google ? { google } : {}),
      ...(identities ? { identities } : {}),
    };

    const { signedUpAt: nextSignedUpAt, ...updatableUser } = nextUser;

    await mongoService.user.updateOne(
      { _id: userId },
      {
        $set: updatableUser,
        $setOnInsert: {
          signedUpAt: nextSignedUpAt,
          "billing.subscriptionStatus": "awaiting_checkout",
        },
      },
      { upsert: true, session },
    );

    // Every auth path lands here, so this is the one place that can promise a
    // new account owns somewhere to write: Google discovery only creates
    // google-sourced calendars, which leaves a password-only account with
    // none at all, and syncLocalEventsToCloud needs this to be the landing
    // place for whatever the user wrote before signing up.
    //
    // New accounts only. Doing it on every sign-in would also hand one to
    // every existing Google user, who would find a calendar they never made
    // in their sidebar and an empty column in their day view.
    if (isNewUser) {
      await calendarService.ensureLocalCalendar(userId, session);
    }

    return {
      user: {
        ...nextUser,
        userId: userId.toString(),
      },
      isNewUser,
    };
  };

  deleteCompassDataForUser = async (
    userId: string,
  ): Promise<Summary_Delete> => {
    const _id = zObjectId.parse(userId);
    const summary: Summary_Delete = {};
    const authCleanupTarget =
      await supertokensUserCleanupService.resolveByExternalUserId(userId);
    const session = await mongoService.startSession();

    try {
      await session.withTransaction(async (session) => {
        const user = await mongoService.user.findOne({ _id }, { session });

        if (!user) {
          logger.warn(`User(${userId}) not found while deleting compass data`);
        }

        // Events first: they are reachable only through the calendars that own
        // them, so deleting the calendars first would leave nothing to find them
        // by.
        const events = await eventService.deleteAllByUser(userId, session);
        summary.events = events.deletedCount;

        const calendars = await calendarService.deleteAllByUser(
          userId,
          session,
        );
        summary.calendars = calendars.deletedCount;

        const hiddenEvents = await hiddenEventService.deleteAllByUser(
          _id,
          session,
        );
        summary.hiddenEvents = hiddenEvents.deletedCount;

        // delete user
        const userDel = await mongoService.user.deleteOne({ _id }, { session });
        summary.user = userDel.deletedCount;
      });
    } finally {
      await session.endSession();
    }

    const { sessionsRevoked } =
      await compassAuthService.revokeSessionsByUser(userId);
    summary.sessions = sessionsRevoked;

    const authSummary =
      await supertokensUserCleanupService.cleanupResolvedTarget(
        authCleanupTarget,
      );

    return { ...summary, ...authSummary };
  };

  /**
   * Deletes everything Compass knows about a user. Their Google Calendar data
   * itself is never touched. Provider grant revocation happens inside Sync's
   * principal purge, which revokes EVERY connection's credential - the legacy
   * single-slot revoke here could only ever cover the last-written account.
   * Sync principal purge is durable: a Sync outage does not strand an
   * undeleted Compass account, and the queued principal is retried until its
   * credential/cache purge succeeds.
   */
  deleteAccount = async (userId: string): Promise<Summary_Delete> => {
    await mongoService.pendingAccountDeletion.updateOne(
      { _id: userId },
      { $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );

    // This has to precede deletion of the user row, which is our only durable
    // Stripe customer mapping. If Stripe cannot confirm cancellation, leave
    // the account intact and ask the user to retry rather than risk a charge
    // after telling them their account has gone.
    let stripeCustomerDeleted = false;
    try {
      await stripeService.deleteCustomerForAccount(userId);
      stripeCustomerDeleted = true;
      await mongoService.pendingAccountDeletion.updateOne(
        { _id: userId },
        { $set: { stripeCustomerDeletedAt: new Date() } },
      );
    } catch (error) {
      // Stripe failed before we could establish a safe cancellation. The
      // account remains available for an explicit user retry.
      if (!stripeCustomerDeleted) {
        await mongoService.pendingAccountDeletion.deleteOne({ _id: userId });
      }
      throw error;
    }

    return this.#completePendingAccountDeletion(userId);
  };

  // setInterval only prevents future firings; a cycle already in flight when
  // stopAccountDeletionRetries runs keeps executing against mongoService
  // after gracefulShutdown tears it down. Tracking the promise here lets stop
  // wait for it, so shutdown never closes Mongo out from under a live query.
  #runRetryCycle = (logMessage: string): void => {
    const cycle = this.retryPendingAccountDeletions().catch((error) => {
      logger.error(logMessage, error);
    });
    this.#pendingRetryCycle = cycle;
    void cycle.finally(() => {
      if (this.#pendingRetryCycle === cycle)
        this.#pendingRetryCycle = undefined;
    });
  };

  startAccountDeletionRetries = (): void => {
    if (this.#accountDeletionRetryTimer) return;
    this.#runRetryCycle("Could not start pending account deletion retries");
    this.#accountDeletionRetryTimer = setInterval(() => {
      this.#runRetryCycle("Could not retry pending account deletions");
    }, ACCOUNT_DELETION_RETRY_INTERVAL_MS);
  };

  stopAccountDeletionRetries = async (): Promise<void> => {
    if (this.#accountDeletionRetryTimer) {
      clearInterval(this.#accountDeletionRetryTimer);
      this.#accountDeletionRetryTimer = undefined;
    }
    await this.#pendingRetryCycle;
  };

  retryPendingAccountDeletions = async (): Promise<void> => {
    await this.#migrateLegacySyncPrincipalDeletions();

    const pendingLocalCleanup = await mongoService.pendingAccountDeletion
      .find(
        {
          $or: [
            { stripeCustomerDeletedAt: { $exists: false } },
            { compassDataDeletedAt: { $exists: false } },
          ],
        },
        {
          projection: {
            _id: 1,
            stripeCustomerDeletedAt: 1,
            compassDataDeletedAt: 1,
          },
        },
      )
      .sort({ createdAt: 1 })
      .limit(ACCOUNT_DELETION_RETRY_BATCH_SIZE)
      .toArray();
    const syncRetrySlots =
      ACCOUNT_DELETION_RETRY_BATCH_SIZE - pendingLocalCleanup.length;
    const pendingSyncPurge =
      syncRetrySlots === 0
        ? []
        : await mongoService.pendingAccountDeletion
            .find(
              {
                stripeCustomerDeletedAt: { $exists: true },
                compassDataDeletedAt: { $exists: true },
              },
              {
                projection: {
                  _id: 1,
                  stripeCustomerDeletedAt: 1,
                  compassDataDeletedAt: 1,
                },
              },
            )
            .sort({ lastSyncPurgeAttemptAt: 1, createdAt: 1 })
            .limit(syncRetrySlots)
            .toArray();

    for (const deletion of [...pendingLocalCleanup, ...pendingSyncPurge]) {
      try {
        if (!deletion.stripeCustomerDeletedAt) {
          await stripeService.deleteCustomerForAccount(deletion._id);
          await mongoService.pendingAccountDeletion.updateOne(
            { _id: deletion._id },
            { $set: { stripeCustomerDeletedAt: new Date() } },
          );
        }
        await this.#completePendingAccountDeletion(
          deletion._id,
          deletion.compassDataDeletedAt,
        );
      } catch (error) {
        logger.warn("Pending account deletion will retry", error);
      }
    }
  };

  async #migrateLegacySyncPrincipalDeletions(): Promise<void> {
    const legacyQueue =
      mongoService.db.collection<LegacyPendingSyncPrincipalDeletionRecord>(
        Collections.LEGACY_PENDING_SYNC_PRINCIPAL_DELETION,
      );
    const legacyPending = await legacyQueue
      .find({})
      .sort({ requestedAt: 1 })
      .limit(ACCOUNT_DELETION_RETRY_BATCH_SIZE)
      .toArray();

    for (const deletion of legacyPending) {
      try {
        await mongoService.pendingAccountDeletion.updateOne(
          { _id: deletion._id },
          {
            $setOnInsert: {
              createdAt: deletion.requestedAt,
              stripeCustomerDeletedAt: deletion.requestedAt,
              compassDataDeletedAt: deletion.requestedAt,
              lastSyncPurgeAttemptAt: deletion.lastAttemptAt,
              syncPurgeAttempts: deletion.attempts,
            },
          },
          { upsert: true },
        );
        await legacyQueue.deleteOne({ _id: deletion._id });
      } catch (error) {
        logger.warn(
          "Legacy Sync principal deletion will retry migration",
          error,
        );
      }
    }
  }

  async #completePendingAccountDeletion(
    userId: string,
    compassDataDeletedAt?: Date,
  ): Promise<Summary_Delete> {
    let summary: Summary_Delete = {};
    if (!compassDataDeletedAt) {
      summary = await this.deleteCompassDataForUser(userId);
      await mongoService.pendingAccountDeletion.updateOne(
        { _id: userId },
        { $set: { compassDataDeletedAt: new Date() } },
      );
    }

    if (await this.#purgeSyncPrincipal(userId)) {
      await mongoService.pendingAccountDeletion.deleteOne({ _id: userId });
    }
    return summary;
  }

  #purgeSyncPrincipal = async (userId: string): Promise<boolean> => {
    const now = new Date();
    try {
      const result = await getSyncServiceClient().purgePrincipal(
        toSyncPrincipal(userId),
      );
      if (result.ok) return true;

      logger.warn(
        `Sync principal purge deferred (${result.error.kind}, correlation=${result.error.correlationId})`,
      );
    } catch (error) {
      logger.warn(
        "Sync principal purge deferred after an unexpected error",
        error,
      );
    }

    await mongoService.pendingAccountDeletion.updateOne(
      { _id: userId },
      {
        $set: { lastSyncPurgeAttemptAt: now },
        $inc: { syncPurgeAttempts: 1 },
      },
    );
    return false;
  };

  // Update the user's Google profile facts (identity id, picture) and stamp
  // the sign-in. Credentials are deliberately NOT stored here - Sync's
  // credential store is the single authority (see adoptConnection).
  refreshGoogleProfile = async (
    cUserId: string,
    gUser: TokenPayload,
  ): Promise<WithId<Schema_User>> => {
    const user = await mongoService.user.findOneAndUpdate(
      { _id: zObjectId.parse(cUserId) },
      {
        $set: {
          "google.googleId": gUser.sub ?? "",
          "google.picture": gUser.picture ?? "",
          lastLoggedInAt: new Date(),
        },
        // The legacy single-slot credential; nothing reads it anymore, and
        // leaving a stale token behind is worse than clearing it.
        $unset: { "google.gRefreshToken": "" },
      },
      { returnDocument: "after" },
    );

    zObjectId.parse(user?._id, { error: () => "Invalid credentials" });
    return user as WithId<Schema_User>;
  };

  /**
   * Records that `userId`'s client is actively connected right now (called
   * on every SSE (re)connect). This is what the watch-maintenance activity
   * gate (A40) reads to tell an active user apart from an abandoned account,
   * since post-cutover EventRecords carry no `user`/`origin` field to query
   * instead. Callers fire this off without awaiting/blocking on it.
   */
  touchLastSeenAt = async (userId: string): Promise<void> => {
    await mongoService.user.updateOne(
      { _id: zObjectId.parse(userId) },
      { $set: { lastSeenAt: new Date() } },
    );
  };
}

export default new UserService();
