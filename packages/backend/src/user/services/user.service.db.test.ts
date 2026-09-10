import { faker } from "@faker-js/faker";
import { type ObjectId } from "mongodb";
import * as supertokensNode from "supertokens-node";
import SupertokensUserMetadata from "supertokens-node/recipe/usermetadata";
import { UserDriver } from "@backend/__tests__/drivers/user.driver";
import {
  buildEventRecord,
  seedGoogleCalendar,
} from "@backend/__tests__/helpers/event-propagation.test-helpers";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import compassAuthService from "@backend/auth/services/compass/compass.auth.service";
import supertokensUserCleanupService from "@backend/auth/services/supertokens/supertokens.user-cleanup.service";
import stripeService from "@backend/billing/services/stripe.service";
import calendarService from "@backend/calendar/services/calendar.service";
import { UserError } from "@backend/common/errors/user/user.errors";
import * as supertokensMiddleware from "@backend/common/middleware/supertokens.middleware";
import { initSupertokens } from "@backend/common/middleware/supertokens.middleware";
import mongoService from "@backend/common/services/mongo.service";
import * as syncServiceFactory from "@backend/common/services/sync-service/sync-service.factory";
import userService from "@backend/user/services/user.service";
import userMetadataService from "@backend/user/services/user-metadata.service";
import { type Summary_Delete } from "@backend/user/types/user.types";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

// Seeds `count` Google-provider calendars each with one event - a stand-in for
// the legacy engine's full import flow, which used to seed realistic-looking
// data here. These tests only care that Google-sourced calendars/events exist
// to be cleaned up, not that they came from a real (mocked) Google API call.
const seedGoogleCalendarsWithEvents = async (userId: ObjectId, count = 1) => {
  const calendars = await Promise.all(
    Array.from({ length: count }, () => seedGoogleCalendar(userId)),
  );
  await mongoService.event.insertMany(
    calendars.map((calendar) => buildEventRecord(calendar._id)),
  );
  return calendars;
};

const createSupertokensUser = (userId: string, recipeUserIds: string[]) => ({
  id: userId,
  loginMethods: recipeUserIds.map((recipeUserId) => ({
    recipeUserId: {
      getAsString: () => recipeUserId,
    },
  })),
});

describe("UserService", () => {
  beforeAll(initSupertokens);
  beforeAll(async () => {
    await setupTestDb(import.meta.url);
  });
  beforeEach(cleanupCollections);
  beforeEach(() => {
    spyOn(compassAuthService, "revokeSessionsByUser").mockResolvedValue({
      sessionsRevoked: 0,
    });
  });
  afterAll(cleanupTestDb);

  describe("createUser", () => {
    it("persists a new compass user with Google data", async () => {
      const gUser = UserDriver.generateGoogleUser();

      const { userId } = await userService.createUser(gUser);
      const storedUser = await mongoService.user.findOne({
        _id: mongoService.objectId(userId),
      });

      expect(storedUser?.email).toBe(gUser.email as string);
      expect(storedUser?.google?.googleId).toBe(gUser.sub);
      // The credential lives only in Sync now.
      expect(storedUser?.google?.gRefreshToken).toBeUndefined();
      expect(storedUser?.identities).toEqual([
        expect.objectContaining({
          provider: "google",
          subjectId: gUser.sub,
          email: gUser.email,
        }),
      ]);
    });
  });

  describe("getProfile", () => {
    it("returns the user profile for a valid user ID", async () => {
      const user = await UserDriver.createUser();
      const userId = user._id;

      expect(user.google).toBeDefined();
      const profile = await userService.getProfile(userId);

      expect(profile).toEqual(
        expect.objectContaining({
          userId: userId.toString(),
          picture: user.google!.picture,
          firstName: user.firstName,
          lastName: user.lastName,
          name: user.name,
          email: user.email,
          locale: user.locale,
        }),
      );
    });

    it("throws UserNotFound error when user does not exist", async () => {
      const nonExistentId = mongoService.objectId();

      await expect(userService.getProfile(nonExistentId)).rejects.toThrow(
        UserError.UserNotFound.description,
      );
    });
  });

  describe("getCanonicalCompassUserId", () => {
    it("returns the connected Compass user id for a matching Google user id", async () => {
      const user = await UserDriver.createUser();

      await expect(
        userService.getCanonicalCompassUserId({
          provider: "google",
          subjectId: user.google?.googleId,
          email: faker.internet.email(),
        }),
      ).resolves.toBe(user._id.toString());
    });

    it("falls back to a normalized email lookup when the provider subject is new", async () => {
      const user = await UserDriver.createUser();
      const normalizedEmail = user.email.toLowerCase();
      await mongoService.user.updateOne(
        { _id: user._id },
        { $set: { email: normalizedEmail } },
      );

      await expect(
        userService.getCanonicalCompassUserId({
          provider: "microsoft",
          subjectId: faker.string.uuid(),
          email: ` ${normalizedEmail.toUpperCase()} `,
        }),
      ).resolves.toBe(user._id.toString());
    });

    it("does not fall back onto an unverified password-only user", async () => {
      const user = await UserDriver.createUser({ withGoogle: false });
      const normalizedEmail = user.email.toLowerCase();
      await mongoService.user.updateOne(
        { _id: user._id },
        { $set: { email: normalizedEmail } },
      );

      await expect(
        userService.getCanonicalCompassUserId({
          provider: "google",
          subjectId: faker.string.uuid(),
          email: ` ${normalizedEmail.toUpperCase()} `,
        }),
      ).resolves.toBeNull();
    });

    it("returns null when neither lookup finds a Compass user", async () => {
      await expect(
        userService.getCanonicalCompassUserId({
          provider: "google",
          subjectId: faker.string.uuid(),
          email: faker.internet.email(),
        }),
      ).resolves.toBeNull();
    });
  });

  describe("upsertUserFromAuth", () => {
    it("creates a password user with normalized fields", async () => {
      const userId = mongoService.objectId().toString();

      const result = await userService.upsertUserFromAuth({
        userId,
        email: "  Foo@Bar.com ",
        name: "  Tyler Durden ",
      });

      expect(result.isNewUser).toBe(true);
      expect(result.user).toEqual(
        expect.objectContaining({
          userId,
          email: "foo@bar.com",
          name: "Tyler Durden",
          firstName: "Tyler",
          lastName: "Durden",
        }),
      );

      const storedUser = await mongoService.user.findOne({
        _id: mongoService.objectId(userId),
      });
      expect(storedUser?.google).toBeUndefined();
    });

    it("starts a fresh signup in awaiting_checkout", async () => {
      const userId = mongoService.objectId().toString();

      await userService.upsertUserFromAuth({
        userId,
        email: "new-billing@example.com",
        name: "New Billing",
      });

      const storedUser = await mongoService.user.findOne({
        _id: mongoService.objectId(userId),
      });
      expect(storedUser?.billing?.subscriptionStatus).toBe("awaiting_checkout");
    });

    it("does not overwrite billing on a returning user", async () => {
      const userId = mongoService.objectId();
      await mongoService.user.insertOne({
        _id: userId,
        email: "returning@example.com",
        name: "Returning",
        firstName: "Returning",
        lastName: "User",
        locale: "en",
        billing: {
          subscriptionStatus: "active",
          stripeCustomerId: "cus_keep",
        },
      });

      await userService.upsertUserFromAuth({
        userId: userId.toString(),
        email: "returning@example.com",
        name: "Returning",
      });

      const storedUser = await mongoService.user.findOne({ _id: userId });
      expect(storedUser?.billing).toEqual({
        subscriptionStatus: "active",
        stripeCustomerId: "cus_keep",
      });
    });

    // Only Google discovery creates calendars, so without this a
    // password-only account owns none and every write fails
    // CALENDAR_NOT_FOUND.
    it("gives a new user a local calendar to write to", async () => {
      const userId = mongoService.objectId().toString();

      await userService.upsertUserFromAuth({
        userId,
        email: "solo@example.com",
        name: "Solo User",
      });

      const calendar = await calendarService.getLocalCalendar(userId);
      expect(calendar).toEqual(
        expect.objectContaining({ access: "owner", isActive: true }),
      );
      expect(calendar?.source).toEqual({ provider: "local" });
    });

    it("keeps a single local calendar across repeat sign-ins", async () => {
      const userId = mongoService.objectId().toString();
      const input = { userId, email: "repeat@example.com", name: "Repeat" };

      await userService.upsertUserFromAuth(input);
      const first = await calendarService.getLocalCalendar(userId);
      await userService.upsertUserFromAuth(input);

      const calendars = await mongoService.calendar
        .find({
          userId: mongoService.objectId(userId),
          "source.provider": "local",
        })
        .toArray();
      expect(calendars).toHaveLength(1);
      expect(calendars[0]?._id.toString()).toBe(first?._id.toString());
    });

    // Handing one to everyone who signs in would put a calendar they never
    // made in every existing Google user's sidebar, and an empty column in
    // their day view.
    it("does not hand an existing user a local calendar they never had", async () => {
      const user = await UserDriver.createUser();

      await userService.upsertUserFromAuth({
        userId: user._id.toString(),
        email: user.email,
      });

      expect(
        await calendarService.getLocalCalendar(user._id.toString()),
      ).toBeNull();
    });

    it("updates an existing user without removing stored Google data", async () => {
      const user = await UserDriver.createUser();

      const result = await userService.upsertUserFromAuth({
        userId: user._id.toString(),
        email: "updated@example.com",
      });

      expect(result.isNewUser).toBe(false);

      const storedUser = await mongoService.user.findOne({ _id: user._id });
      expect(storedUser?.email).toBe("updated@example.com");
      expect(storedUser?.name).toBe(user.name);
      expect(storedUser?.google?.googleId).toBe(user.google?.googleId);
      expect(storedUser?.google?.gRefreshToken).toBe(
        user.google?.gRefreshToken,
      );
    });

    it("reuses an existing Compass user with the same normalized email", async () => {
      const user = await UserDriver.createUser();
      const normalizedEmail = user.email.toLowerCase();
      await mongoService.user.updateOne(
        { _id: user._id },
        { $set: { email: normalizedEmail } },
      );
      const otherUserId = mongoService.objectId().toString();

      const result = await userService.upsertUserFromAuth({
        userId: otherUserId,
        email: ` ${normalizedEmail.toUpperCase()} `,
        name: "Replacement Name",
        identities: [
          {
            provider: "microsoft",
            subjectId: "ms-oid-reuse",
            email: normalizedEmail,
            linkedAt: new Date("2026-09-05T00:00:00.000Z"),
          },
        ],
      });

      expect(result.isNewUser).toBe(false);
      expect(result.user.userId).toBe(user._id.toString());

      const storedUsers = await mongoService.user
        .find({ email: normalizedEmail })
        .toArray();

      expect(storedUsers).toHaveLength(1);
      expect(storedUsers[0]?._id).toEqual(user._id);
      expect(storedUsers[0]?.name).toBe("Replacement Name");
      expect(storedUsers[0]?.google?.googleId).toBe(user.google?.googleId);
      expect(storedUsers[0]?.google?.gRefreshToken).toBe(
        user.google?.gRefreshToken,
      );
    });

    it("does not query by id when a different user already exists for the email", async () => {
      const user = await UserDriver.createUser();
      const normalizedEmail = user.email.toLowerCase();
      await mongoService.user.updateOne(
        { _id: user._id },
        { $set: { email: normalizedEmail } },
      );
      const otherUserId = mongoService.objectId().toString();
      const findOneSpy = spyOn(mongoService.user, "findOne");

      await userService.upsertUserFromAuth({
        userId: otherUserId,
        email: ` ${normalizedEmail.toUpperCase()} `,
        name: "Replacement Name",
        identities: [
          {
            provider: "microsoft",
            subjectId: "ms-oid-lookup",
            email: normalizedEmail,
            linkedAt: new Date("2026-09-05T00:00:00.000Z"),
          },
        ],
      });

      expect(findOneSpy.mock.calls).toEqual([
        [{ email: normalizedEmail }, { session: undefined }],
      ]);
    });

    it("reuses a password-only Compass user on a later password sign-in", async () => {
      const userId = mongoService.objectId().toString();
      await userService.upsertUserFromAuth({
        userId,
        email: "solo-password@example.com",
        name: "Password Person",
      });
      const otherUserId = mongoService.objectId().toString();

      const result = await userService.upsertUserFromAuth({
        userId: otherUserId,
        email: "Solo-Password@Example.com",
        name: "Password Person",
      });

      expect(result.isNewUser).toBe(false);
      expect(result.user.userId).toBe(userId);
      const storedUsers = await mongoService.user
        .find({ email: "solo-password@example.com" })
        .toArray();
      expect(storedUsers).toHaveLength(1);
    });

    it("does not attach a verified login to an unverified password-only user", async () => {
      const passwordUserId = mongoService.objectId().toString();
      await userService.upsertUserFromAuth({
        userId: passwordUserId,
        email: "unverified@example.com",
        name: "Password Person",
      });
      const googleUserId = mongoService.objectId().toString();

      const result = await userService.upsertUserFromAuth({
        userId: googleUserId,
        email: "unverified@example.com",
        name: "Google Person",
        google: { googleId: "g-sub-1", picture: "not provided" },
      });

      expect(result.isNewUser).toBe(true);
      expect(result.user.userId).toBe(googleUserId);
      const storedUsers = await mongoService.user
        .find({ email: "unverified@example.com" })
        .toArray();
      expect(storedUsers).toHaveLength(2);
      expect(
        storedUsers.find((user) => user._id.toString() === passwordUserId)
          ?.google,
      ).toBeUndefined();
    });

    it("merges a microsoft identity onto the user without dropping google", async () => {
      const user = await UserDriver.createUser();
      const microsoft = {
        provider: "microsoft" as const,
        subjectId: "ms-oid-1",
        email: user.email,
        linkedAt: new Date("2026-09-05T00:00:00.000Z"),
      };

      await userService.upsertUserFromAuth({
        userId: user._id.toString(),
        email: user.email,
        identities: [microsoft],
      });

      const storedUser = await mongoService.user.findOne({ _id: user._id });
      expect(storedUser?.google?.googleId).toBe(user.google?.googleId);
      expect(storedUser?.identities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            provider: "google",
            subjectId: user.google?.googleId,
          }),
          expect.objectContaining({
            provider: "microsoft",
            subjectId: "ms-oid-1",
          }),
        ]),
      );
    });
  });

  describe("deleteAccount", () => {
    const deleteAccountSpies: Array<{ mockRestore: () => void }> = [];

    beforeEach(() => {
      deleteAccountSpies.length = 0;
      deleteAccountSpies.push(
        spyOn(
          supertokensUserCleanupService,
          "resolveByExternalUserId",
        ).mockResolvedValue({
          externalUserIds: [],
          superTokensUserIds: [],
        }),
        spyOn(
          supertokensUserCleanupService,
          "cleanupResolvedTarget",
        ).mockResolvedValue({
          superTokensUsers: 0,
          superTokensMappings: 0,
          superTokensMetadata: 0,
        }),
      );
    });

    afterEach(() => {
      for (const spy of deleteAccountSpies) spy.mockRestore();
    });

    it("deletes the user; grant revocation is Sync's purge, not a local call", async () => {
      const user = await UserDriver.createUser();

      const summary = await userService.deleteAccount(user._id.toString());

      expect(summary).toEqual(expect.objectContaining({ user: 1 }));
      expect(await mongoService.user.findOne({ _id: user._id })).toBeNull();
    });

    it("fail-open purges the Sync principal after Compass data is deleted", async () => {
      const user = await UserDriver.createUser();
      const userId = user._id.toString();
      const purgePrincipal = mock(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            connections: 0,
            credentials: 0,
            calendars: 0,
            events: 0,
            eventOccurrences: 0,
            syncResources: 0,
            commands: 0,
            jobs: 0,
            deletionMarkers: 0,
            invalidations: 0,
          },
          correlationId: "corr-purge",
        }),
      );
      deleteAccountSpies.push(
        spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
          purgePrincipal,
        } as never),
      );

      await userService.deleteAccount(userId);

      expect(await mongoService.user.findOne({ _id: user._id })).toBeNull();
      expect(purgePrincipal).toHaveBeenCalledWith({
        tenantId: userId,
        principalId: userId,
      });
    });

    it("still deletes the account when Sync principal purge fails", async () => {
      const user = await UserDriver.createUser();
      deleteAccountSpies.push(
        spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
          purgePrincipal: mock(() =>
            Promise.resolve({
              ok: false as const,
              error: {
                kind: "unavailable" as const,
                correlationId: "corr-down",
              },
            }),
          ),
        } as never),
      );

      await userService.deleteAccount(user._id.toString());

      expect(await mongoService.user.findOne({ _id: user._id })).toBeNull();
      expect(
        await mongoService.pendingAccountDeletion.findOne({
          _id: user._id.toString(),
        }),
      ).toEqual(
        expect.objectContaining({
          compassDataDeletedAt: expect.any(Date),
          syncPurgeAttempts: 1,
        }),
      );
    });

    it("retries a deferred Sync purge after the account has been deleted", async () => {
      const user = await UserDriver.createUser();
      let calls = 0;
      deleteAccountSpies.push(
        spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
          purgePrincipal: mock(() => {
            calls += 1;
            return Promise.resolve(
              calls === 1
                ? {
                    ok: false as const,
                    error: {
                      kind: "unavailable" as const,
                      correlationId: "corr-down",
                    },
                  }
                : {
                    ok: true as const,
                    value: {
                      connections: 0,
                      credentials: 0,
                      calendars: 0,
                      events: 0,
                      eventOccurrences: 0,
                      syncResources: 0,
                      commands: 0,
                      jobs: 0,
                      deletionMarkers: 0,
                      invalidations: 0,
                    },
                    correlationId: "corr-purge",
                  },
            );
          }),
        } as never),
      );

      await userService.deleteAccount(user._id.toString());
      const localCleanup = spyOn(userService, "deleteCompassDataForUser");
      deleteAccountSpies.push(localCleanup);
      await userService.retryPendingAccountDeletions();

      expect(calls).toBe(2);
      expect(localCleanup).not.toHaveBeenCalled();
      expect(
        await mongoService.pendingAccountDeletion.findOne({
          _id: user._id.toString(),
        }),
      ).toBeNull();
    });

    it("adopts legacy Sync purge rows without repeating account cleanup", async () => {
      const userId = mongoService.objectId().toString();
      const requestedAt = new Date(Date.now() - 60_000);
      await UserDriver.createLegacyPendingSyncPrincipalDeletion({
        _id: userId,
        requestedAt,
        lastAttemptAt: requestedAt,
        attempts: 2,
      });
      deleteAccountSpies.push(
        spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
          purgePrincipal: mock(() =>
            Promise.resolve({
              ok: false as const,
              error: {
                kind: "unavailable" as const,
                correlationId: "corr-legacy-down",
              },
            }),
          ),
        } as never),
      );
      const localCleanup = spyOn(userService, "deleteCompassDataForUser");
      deleteAccountSpies.push(localCleanup);

      await userService.retryPendingAccountDeletions();

      expect(localCleanup).not.toHaveBeenCalled();
      expect(
        await UserDriver.findLegacyPendingSyncPrincipalDeletion(userId),
      ).toBeNull();
      expect(
        await mongoService.pendingAccountDeletion.findOne({ _id: userId }),
      ).toEqual(
        expect.objectContaining({
          stripeCustomerDeletedAt: requestedAt,
          compassDataDeletedAt: requestedAt,
          syncPurgeAttempts: 3,
        }),
      );
    });

    it("idempotently drains a legacy row already adopted by the unified queue", async () => {
      const userId = mongoService.objectId().toString();
      const requestedAt = new Date(Date.now() - 60_000);
      await UserDriver.createLegacyPendingSyncPrincipalDeletion({
        _id: userId,
        requestedAt,
        lastAttemptAt: requestedAt,
        attempts: 1,
      });
      await mongoService.pendingAccountDeletion.insertOne({
        _id: userId,
        createdAt: requestedAt,
        stripeCustomerDeletedAt: requestedAt,
        compassDataDeletedAt: requestedAt,
        syncPurgeAttempts: 1,
      });
      const purgePrincipal = mock(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            connections: 0,
            credentials: 0,
            calendars: 0,
            events: 0,
            eventOccurrences: 0,
            syncResources: 0,
            commands: 0,
            jobs: 0,
            deletionMarkers: 0,
            invalidations: 0,
          },
          correlationId: "corr-legacy-purge",
        }),
      );
      deleteAccountSpies.push(
        spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
          purgePrincipal,
        } as never),
      );

      await userService.retryPendingAccountDeletions();

      expect(purgePrincipal).toHaveBeenCalledTimes(1);
      expect(
        await UserDriver.findLegacyPendingSyncPrincipalDeletion(userId),
      ).toBeNull();
      expect(
        await mongoService.pendingAccountDeletion.findOne({ _id: userId }),
      ).toBeNull();
    });

    it("prioritizes newer local cleanup over a full batch of Sync-only retries", async () => {
      const oldStage = new Date(Date.now() - 120_000);
      await UserDriver.createPendingAccountDeletions(100, (index) => ({
        createdAt: new Date(oldStage.getTime() + index),
        stripeCustomerDeletedAt: oldStage,
        compassDataDeletedAt: oldStage,
      }));
      const user = await UserDriver.createUser();
      const userId = user._id.toString();
      await UserDriver.createPendingAccountDeletions(1, () => ({
        _id: userId,
        createdAt: new Date(),
        stripeCustomerDeletedAt: new Date(),
      }));
      deleteAccountSpies.push(
        spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
          purgePrincipal: mock(() =>
            Promise.resolve({
              ok: false as const,
              error: {
                kind: "unavailable" as const,
                correlationId: "corr-batch-down",
              },
            }),
          ),
        } as never),
      );

      await userService.retryPendingAccountDeletions();

      expect(await mongoService.user.findOne({ _id: user._id })).toBeNull();
      expect(
        await mongoService.pendingAccountDeletion.findOne({ _id: userId }),
      ).toEqual(
        expect.objectContaining({
          compassDataDeletedAt: expect.any(Date),
          syncPurgeAttempts: 1,
        }),
      );
    });

    it("rotates Sync-only failures beyond the first retry batch", async () => {
      const stage = new Date(Date.now() - 120_000);
      await UserDriver.createPendingAccountDeletions(101, (index) => ({
        createdAt: new Date(stage.getTime() + index),
        stripeCustomerDeletedAt: stage,
        compassDataDeletedAt: stage,
      }));
      deleteAccountSpies.push(
        spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
          purgePrincipal: mock(() =>
            Promise.resolve({
              ok: false as const,
              error: {
                kind: "unavailable" as const,
                correlationId: "corr-rotation-down",
              },
            }),
          ),
        } as never),
      );

      await userService.retryPendingAccountDeletions();
      const [notYetAttempted] = await mongoService.pendingAccountDeletion
        .find({ lastSyncPurgeAttemptAt: { $exists: false } })
        .toArray();

      expect(notYetAttempted).toBeDefined();
      expect(
        await mongoService.pendingAccountDeletion.countDocuments({
          lastSyncPurgeAttemptAt: { $exists: false },
        }),
      ).toBe(1);

      await userService.retryPendingAccountDeletions();

      expect(
        await mongoService.pendingAccountDeletion.findOne({
          _id: notYetAttempted!._id,
        }),
      ).toEqual(
        expect.objectContaining({
          lastSyncPurgeAttemptAt: expect.any(Date),
          syncPurgeAttempts: 1,
        }),
      );
    });

    it("keeps the account intact when Stripe cannot cancel its customer", async () => {
      const user = await UserDriver.createUser();
      await mongoService.user.updateOne(
        { _id: user._id },
        {
          $set: {
            billing: {
              subscriptionStatus: "trialing",
              stripeCustomerId: "cus_trial",
            },
          },
        },
      );
      const cancellation = spyOn(
        stripeService,
        "deleteCustomerForAccount",
      ).mockRejectedValue(new Error("Stripe unavailable"));

      await expect(
        userService.deleteAccount(user._id.toString()),
      ).rejects.toThrow("Stripe unavailable");
      expect(await mongoService.user.findOne({ _id: user._id })).not.toBeNull();

      cancellation.mockRestore();
    });

    it("deletes the account when lastLoggedInAt was never stamped", async () => {
      const user = await UserDriver.createUser();
      await mongoService.user.updateOne(
        { _id: user._id },
        { $unset: { lastLoggedInAt: "" } },
      );

      await userService.deleteAccount(user._id.toString());

      expect(await mongoService.user.findOne({ _id: user._id })).toBeNull();
    });

    it("deletes the account when the last sign-in was not recent", async () => {
      const user = await UserDriver.createUser();
      await mongoService.user.updateOne(
        { _id: user._id },
        { $set: { lastLoggedInAt: new Date(Date.now() - 16 * 60_000) } },
      );

      await userService.deleteAccount(user._id.toString());

      expect(await mongoService.user.findOne({ _id: user._id })).toBeNull();
    });

    it("retries local cleanup after Stripe cancellation has succeeded", async () => {
      const user = await UserDriver.createUser();
      const cleanup = spyOn(
        userService,
        "deleteCompassDataForUser",
      ).mockRejectedValueOnce(new Error("Mongo unavailable"));

      await expect(
        userService.deleteAccount(user._id.toString()),
      ).rejects.toThrow("Mongo unavailable");
      expect(
        await mongoService.pendingAccountDeletion.findOne({
          _id: user._id.toString(),
        }),
      ).toEqual(
        expect.objectContaining({ stripeCustomerDeletedAt: expect.any(Date) }),
      );

      cleanup.mockRestore();
      await userService.retryPendingAccountDeletions();

      expect(await mongoService.user.findOne({ _id: user._id })).toBeNull();
      expect(
        await mongoService.pendingAccountDeletion.findOne({
          _id: user._id.toString(),
        }),
      ).toEqual(
        expect.objectContaining({
          compassDataDeletedAt: expect.any(Date),
          syncPurgeAttempts: 1,
        }),
      );
    });

    it("keeps the deletion marker when recording Stripe success fails", async () => {
      const user = await UserDriver.createUser();
      const updateOne = mongoService.pendingAccountDeletion.updateOne.bind(
        mongoService.pendingAccountDeletion,
      );
      let calls = 0;
      const markerWrite = spyOn(
        mongoService.pendingAccountDeletion,
        "updateOne",
      ).mockImplementation((...args) => {
        calls += 1;
        if (calls === 2) return Promise.reject(new Error("Marker unavailable"));
        return updateOne(...args);
      });

      await expect(
        userService.deleteAccount(user._id.toString()),
      ).rejects.toThrow("Marker unavailable");
      expect(
        await mongoService.pendingAccountDeletion.findOne({
          _id: user._id.toString(),
        }),
      ).not.toBeNull();

      markerWrite.mockRestore();
      await userService.retryPendingAccountDeletions();
      expect(await mongoService.user.findOne({ _id: user._id })).toBeNull();
    });
  });

  describe("account deletion retry lifecycle", () => {
    afterEach(async () => {
      await userService.stopAccountDeletionRetries();
    });

    it("waits for an in-flight retry cycle before resolving, so shutdown never tears down mongo mid-cycle", async () => {
      let releaseRetry: () => void = () => {};
      const retrySpy = spyOn(
        userService,
        "retryPendingAccountDeletions",
      ).mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            releaseRetry = resolve;
          }),
      );

      userService.startAccountDeletionRetries();
      await Promise.resolve();

      let stopped = false;
      const stopPromise = userService.stopAccountDeletionRetries().then(() => {
        stopped = true;
      });

      await Promise.resolve();
      await Promise.resolve();
      expect(stopped).toBe(false);

      releaseRetry();
      await stopPromise;
      expect(stopped).toBe(true);

      retrySpy.mockRestore();
    });
  });

  describe("deleteCompassDataForUser", () => {
    it("removes all compass data and deletes the user", async () => {
      const user = await UserDriver.createUser();
      const userId = user._id.toString();
      const storedUser = await mongoService.user.findOne({ _id: user._id });

      expect(storedUser).toBeDefined();
      expect(storedUser).not.toBeNull();

      const resolveSpy = spyOn(
        supertokensUserCleanupService,
        "resolveByExternalUserId",
      ).mockResolvedValue({
        externalUserIds: [],
        superTokensUserIds: [],
      });
      const revokeSpy = spyOn(
        compassAuthService,
        "revokeSessionsByUser",
      ).mockResolvedValue({ sessionsRevoked: 0 });
      const cleanupSpy = spyOn(
        supertokensUserCleanupService,
        "cleanupResolvedTarget",
      ).mockResolvedValue({
        superTokensUsers: 0,
        superTokensMappings: 0,
        superTokensMetadata: 0,
      });

      await seedGoogleCalendarsWithEvents(user._id);

      const summary: Summary_Delete =
        await userService.deleteCompassDataForUser(userId);

      expect(summary).toEqual(
        expect.objectContaining({
          calendars: expect.any(Number) as number,
          events: expect.any(Number) as number,
          sessions: expect.any(Number) as number,
          superTokensUsers: 0,
          superTokensMappings: 0,
          superTokensMetadata: 0,
          user: 1,
        }),
      );

      expect(await mongoService.user.findOne({ _id: user._id })).toBeNull();
      expect(
        await mongoService.calendar.countDocuments({ userId: user._id }),
      ).toBe(0);
      expect(await mongoService.event.countDocuments({})).toBe(0);

      resolveSpy.mockRestore();
      revokeSpy.mockRestore();
      cleanupSpy.mockRestore();
    });

    it("deletes hidden event rows and counts them in the summary", async () => {
      const user = await UserDriver.createUser();
      const userId = user._id.toString();

      const resolveSpy = spyOn(
        supertokensUserCleanupService,
        "resolveByExternalUserId",
      ).mockResolvedValue({
        externalUserIds: [],
        superTokensUserIds: [],
      });
      const revokeSpy = spyOn(
        compassAuthService,
        "revokeSessionsByUser",
      ).mockResolvedValue({ sessionsRevoked: 0 });
      const cleanupSpy = spyOn(
        supertokensUserCleanupService,
        "cleanupResolvedTarget",
      ).mockResolvedValue({
        superTokensUsers: 0,
        superTokensMappings: 0,
        superTokensMetadata: 0,
      });

      await mongoService.hiddenEvent.insertMany([
        {
          _id: mongoService.objectId(),
          userId: user._id,
          eventId: "evt-1",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          _id: mongoService.objectId(),
          userId: user._id,
          eventId: "evt-2",
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      ]);

      const summary: Summary_Delete =
        await userService.deleteCompassDataForUser(userId);

      expect(summary.hiddenEvents).toBe(2);
      expect(
        await mongoService.hiddenEvent.countDocuments({ userId: user._id }),
      ).toBe(0);

      resolveSpy.mockRestore();
      revokeSpy.mockRestore();
      cleanupSpy.mockRestore();
    });

    it("deletes events owned by an archived calendar", async () => {
      const user = await UserDriver.createUser();
      const userId = user._id.toString();

      const resolveSpy = spyOn(
        supertokensUserCleanupService,
        "resolveByExternalUserId",
      ).mockResolvedValue({ externalUserIds: [], superTokensUserIds: [] });
      const revokeSpy = spyOn(
        compassAuthService,
        "revokeSessionsByUser",
      ).mockResolvedValue({ sessionsRevoked: 0 });
      const cleanupSpy = spyOn(
        supertokensUserCleanupService,
        "cleanupResolvedTarget",
      ).mockResolvedValue({
        superTokensUsers: 0,
        superTokensMappings: 0,
        superTokensMetadata: 0,
      });

      await seedGoogleCalendarsWithEvents(user._id);

      // Archiving is what a Google revoke, or a calendar disappearing from the
      // user's Google list, leaves behind: the calendar row stays, its events
      // stay, and only `isActive` flips.
      const event = await mongoService.event.findOne({});
      expect(event).not.toBeNull();
      await mongoService.calendar.updateOne(
        { _id: event!.calendarId },
        { $set: { isActive: false } },
      );
      const archived = await mongoService.event.countDocuments({
        calendarId: event!.calendarId,
      });
      expect(archived).toBeGreaterThan(0);

      const summary = await userService.deleteCompassDataForUser(userId);

      expect(summary.events).toBeGreaterThanOrEqual(archived);
      expect(await mongoService.event.countDocuments({})).toBe(0);

      resolveSpy.mockRestore();
      revokeSpy.mockRestore();
      cleanupSpy.mockRestore();
    });

    it("includes SuperTokens cleanup results after deleting the Compass user", async () => {
      const userId = mongoService.objectId().toString();
      await userService.upsertUserFromAuth({
        userId,
        email: faker.internet.email().toLowerCase(),
        name: "Tyler Durden",
      });

      const resolveSpy = spyOn(
        supertokensUserCleanupService,
        "resolveByExternalUserId",
      ).mockResolvedValue({
        externalUserIds: [userId],
        superTokensUserIds: ["st-user-id"],
      });
      const revokeSpy = spyOn(
        compassAuthService,
        "revokeSessionsByUser",
      ).mockResolvedValue({ sessionsRevoked: 2 });
      const cleanupSpy = spyOn(
        supertokensUserCleanupService,
        "cleanupResolvedTarget",
      ).mockResolvedValue({
        superTokensUsers: 1,
        superTokensMappings: 1,
        superTokensMetadata: 1,
      });

      const summary = await userService.deleteCompassDataForUser(userId);

      expect(resolveSpy).toHaveBeenCalledWith(userId);
      expect(revokeSpy).toHaveBeenCalledWith(userId);
      expect(cleanupSpy).toHaveBeenCalledWith({
        externalUserIds: [userId],
        superTokensUserIds: ["st-user-id"],
      });
      expect(summary).toEqual(
        expect.objectContaining({
          sessions: 2,
          superTokensUsers: 1,
          superTokensMappings: 1,
          superTokensMetadata: 1,
          user: 1,
        }),
      );
      expect(
        await mongoService.user.findOne({ _id: mongoService.objectId(userId) }),
      ).toBeNull();

      resolveSpy.mockRestore();
      revokeSpy.mockRestore();
      cleanupSpy.mockRestore();
    });
  });

  describe("supertokens auth cleanup", () => {
    it("removes orphaned SuperTokens users by email", async () => {
      const initSpy = spyOn(
        supertokensMiddleware,
        "initSupertokens",
      ).mockImplementation(() => undefined);
      const listUsersSpy = spyOn(
        supertokensNode,
        "listUsersByAccountInfo",
      ).mockResolvedValue([
        createSupertokensUser("st-primary-user", ["recipe-user-1"]) as never,
      ]);
      const getUserIdMappingSpy = spyOn(
        supertokensNode,
        "getUserIdMapping",
      ).mockImplementation(
        ({
          userId,
          userIdType,
        }: {
          userId: string;
          userIdType?: "EXTERNAL" | "SUPERTOKENS" | "ANY";
        }) => {
          if (userIdType === "SUPERTOKENS") {
            return Promise.resolve({
              externalUserId: "external-user-1",
              externalUserIdInfo: undefined,
              status: "OK" as const,
              superTokensUserId: userId,
            });
          }

          return Promise.resolve({
            externalUserId: userId,
            externalUserIdInfo: undefined,
            status: "OK" as const,
            superTokensUserId: "recipe-user-1",
          });
        },
      );
      const getUserMetadataSpy = spyOn(
        SupertokensUserMetadata,
        "getUserMetadata",
      ).mockResolvedValue({
        // cleanup only clears non-empty metadata, so the mock must carry a key
        metadata: { someUserSetting: true },
        status: "OK",
      });
      const clearUserMetadataSpy = spyOn(
        SupertokensUserMetadata,
        "clearUserMetadata",
      ).mockResolvedValue({ status: "OK" });
      const deleteUserSpy = spyOn(
        supertokensNode,
        "deleteUser",
      ).mockResolvedValue({ status: "OK" });
      const deleteUserIdMappingSpy = spyOn(
        supertokensNode,
        "deleteUserIdMapping",
      ).mockResolvedValue({
        didMappingExist: true,
        status: "OK",
      });

      const summary =
        await supertokensUserCleanupService.cleanupByEmail("User@example.com");

      expect(initSpy).toHaveBeenCalled();
      expect(listUsersSpy).toHaveBeenCalledWith("public", {
        email: "user@example.com",
      });
      expect(getUserIdMappingSpy).toHaveBeenCalled();
      expect(getUserMetadataSpy).toHaveBeenCalledWith("external-user-1");
      expect(clearUserMetadataSpy).toHaveBeenCalledWith("external-user-1");
      expect(deleteUserSpy).toHaveBeenCalledWith("st-primary-user");
      expect(deleteUserIdMappingSpy).toHaveBeenCalledWith({
        force: true,
        userId: "external-user-1",
        userIdType: "EXTERNAL",
      });
      expect(summary).toEqual({
        superTokensMappings: 1,
        superTokensMetadata: 1,
        superTokensUsers: 1,
      });
    });

    it("removes mapped SuperTokens users by external user id", async () => {
      const initSpy = spyOn(
        supertokensMiddleware,
        "initSupertokens",
      ).mockImplementation(() => undefined);
      const getUserIdMappingSpy = spyOn(
        supertokensNode,
        "getUserIdMapping",
      ).mockImplementation(
        ({
          userId,
          userIdType,
        }: {
          userId: string;
          userIdType?: "EXTERNAL" | "SUPERTOKENS" | "ANY";
        }) => {
          if (userIdType === "SUPERTOKENS") {
            return Promise.resolve({
              externalUserId: "external-user-1",
              externalUserIdInfo: undefined,
              status: "OK" as const,
              superTokensUserId: userId,
            });
          }

          return Promise.resolve({
            externalUserId: userId,
            externalUserIdInfo: undefined,
            status: "OK" as const,
            superTokensUserId: "recipe-user-1",
          });
        },
      );
      const getUserSpy = spyOn(supertokensNode, "getUser").mockResolvedValue(
        createSupertokensUser("st-primary-user", ["recipe-user-1"]) as never,
      );
      const getUserMetadataSpy = spyOn(
        SupertokensUserMetadata,
        "getUserMetadata",
      ).mockResolvedValue({
        // cleanup only clears non-empty metadata, so the mock must carry a key
        metadata: { someUserSetting: true },
        status: "OK",
      });
      const clearUserMetadataSpy = spyOn(
        SupertokensUserMetadata,
        "clearUserMetadata",
      ).mockResolvedValue({ status: "OK" });
      const deleteUserSpy = spyOn(
        supertokensNode,
        "deleteUser",
      ).mockResolvedValue({ status: "OK" });
      const deleteUserIdMappingSpy = spyOn(
        supertokensNode,
        "deleteUserIdMapping",
      ).mockResolvedValue({
        didMappingExist: true,
        status: "OK",
      });

      const summary =
        await supertokensUserCleanupService.cleanupByExternalUserId(
          "external-user-1",
        );

      expect(initSpy).toHaveBeenCalled();
      expect(getUserIdMappingSpy).toHaveBeenCalled();
      expect(getUserSpy).toHaveBeenCalledWith("recipe-user-1");
      expect(getUserMetadataSpy).toHaveBeenCalledWith("external-user-1");
      expect(clearUserMetadataSpy).toHaveBeenCalledWith("external-user-1");
      expect(deleteUserSpy).toHaveBeenCalledWith("st-primary-user");
      expect(deleteUserIdMappingSpy).toHaveBeenCalledWith({
        force: true,
        userId: "external-user-1",
        userIdType: "EXTERNAL",
      });
      expect(summary).toEqual({
        superTokensMappings: 1,
        superTokensMetadata: 1,
        superTokensUsers: 1,
      });
    });
  });

  describe("refreshGoogleProfile", () => {
    it("updates Google profile facts, stamps sign-in, and clears the legacy credential slot", async () => {
      const user = await UserDriver.createUser();
      const userId = user._id.toString();
      // Simulate a legacy row that still carries the retired credential slot.
      await mongoService.user.updateOne(
        { _id: user._id },
        { $set: { "google.gRefreshToken": "legacy-token" } },
      );

      const newGUser = UserDriver.generateGoogleUser({
        sub: faker.string.uuid(),
        picture: faker.image.urlPicsumPhotos(),
      });

      const updatedUser = await userService.refreshGoogleProfile(
        userId,
        newGUser,
      );

      expect(updatedUser._id.toString()).toBe(userId);

      const storedUser = await mongoService.user.findOne({ _id: user._id });

      expect(storedUser?.google?.googleId).toBe(newGUser.sub);
      expect(storedUser?.google?.picture).toBe(newGUser.picture ?? "");
      expect(storedUser?.google?.gRefreshToken).toBeUndefined();
      expect(storedUser?.lastLoggedInAt).toBeDefined();
    });
  });

  describe("updateUserMetadata", () => {
    it("merges metadata and returns the latest snapshot", async () => {
      const user = await UserDriver.createUser();
      const userId = user._id.toString();

      const metadata = await userMetadataService.updateUserMetadata({
        userId,
        data: { theme: "dark" },
      });

      expect(metadata["theme"]).toBe("dark");

      const persisted = await userMetadataService.fetchUserMetadata(userId);

      expect(persisted["theme"]).toBe("dark");
    });
  });

  describe("fetchUserMetadata", () => {
    it("retrieves stored metadata for the user", async () => {
      const user = await UserDriver.createUser();
      const userId = user._id.toString();

      await userMetadataService.updateUserMetadata({
        userId,
        data: { theme: "dark" },
      });

      const metadata = await userMetadataService.fetchUserMetadata(userId);

      expect(metadata["theme"]).toBe("dark");
    });
  });
});
