import { ObjectId } from "mongodb";
import { Status } from "@core/errors/status.codes";
import { BaseDriver } from "@backend/__tests__/drivers/base.driver";
import { UserControllerDriver } from "@backend/__tests__/drivers/user.controller.driver";
import { UtilDriver } from "@backend/__tests__/drivers/util.driver";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { revokeSessionMock } from "@backend/__tests__/helpers/mock.setup";
import compassAuthService from "@backend/auth/services/compass/compass.auth.service";
import supertokensUserCleanupService from "@backend/auth/services/supertokens/supertokens.user-cleanup.service";
import { UserError } from "@backend/common/errors/user/user.errors";
import mongoService from "@backend/common/services/mongo.service";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
} from "bun:test";

describe("UserController", () => {
  const baseDriver = new BaseDriver();
  const userDriver = new UserControllerDriver(baseDriver);

  beforeAll(() => setupTestDb(import.meta.url));
  beforeEach(cleanupCollections);
  afterAll(cleanupTestDb);

  describe("deleteAccount", () => {
    // Deletion reaches for a SuperTokens core and Google, neither of which
    // exists here. The delete-and-revoke logic itself is covered in
    // user.service.test.ts; this is about the route and where userId comes from.
    beforeEach(() => {
      spyOn(compassAuthService, "revokeSessionsByUser").mockResolvedValue({
        sessionsRevoked: 0,
      });
      spyOn(
        supertokensUserCleanupService,
        "resolveByExternalUserId",
      ).mockResolvedValue({ externalUserIds: [], superTokensUserIds: [] });
      spyOn(
        supertokensUserCleanupService,
        "cleanupResolvedTarget",
      ).mockResolvedValue({
        superTokensUsers: 0,
        superTokensMappings: 0,
        superTokensMetadata: 0,
      });
    });

    it("should delete the account of the user in the session", async () => {
      const { user } = await UtilDriver.setupTestUser();

      const response = await userDriver.deleteAccount(
        { userId: user._id.toString() },
        Status.OK,
      );

      expect(response.body).toEqual(expect.objectContaining({ user: 1 }));
      expect(await mongoService.user.findOne({ _id: user._id })).toBeNull();
    });

    // Revoking the user's sessions server-side leaves this caller holding an
    // access token that still passes signature checks, so it boots back up as
    // the deleted user: reads 401, writes fail CALENDAR_NOT_FOUND, and the
    // next sign-up gets tangled in the dead session.
    it("should sign the caller out so their cookies can't outlive the account", async () => {
      const { user } = await UtilDriver.setupTestUser();

      await userDriver.deleteAccount(
        { userId: user._id.toString() },
        Status.OK,
      );

      expect(revokeSessionMock).toHaveBeenCalled();
    });

    // The account is already gone by then, so reporting a failure would tell
    // the user to try again on an account that no longer exists.
    it("should still report success when clearing the cookies fails", async () => {
      const { user } = await UtilDriver.setupTestUser();
      // Lazy rejection (throw on call) rather than mockRejectedValueOnce: the
      // controller only reaches revokeSession after the DB delete, and an
      // eagerly-created rejected promise would be flagged as unhandled in the
      // gap before it is awaited.
      revokeSessionMock.mockImplementationOnce(async () => {
        throw new Error("supertokens down");
      });

      await userDriver.deleteAccount(
        { userId: user._id.toString() },
        Status.OK,
      );

      expect(await mongoService.user.findOne({ _id: user._id })).toBeNull();
    });

    it("should not delete anyone when there is no session", async () => {
      const { user } = await UtilDriver.setupTestUser();

      await userDriver.deleteAccount(undefined, Status.UNAUTHORIZED);

      expect(await mongoService.user.findOne({ _id: user._id })).not.toBeNull();
    });
  });

  describe("getProfile", () => {
    it("should get a user's profile", async () => {
      const { user } = await UtilDriver.setupTestUser();
      const response = await userDriver.getProfile(
        { userId: user._id.toString() },
        Status.OK,
      );

      expect(response.body).toEqual(
        expect.objectContaining({
          userId: user._id.toString(),
          firstName: user.firstName,
          lastName: user.lastName,
          name: user.name,
          email: user.email,
          locale: user.locale,
          picture: user.google?.picture,
        }),
      );
    });

    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should throw a not-found error when no matching user record is found", async () => {
      const response = await userDriver.getProfile(
        { userId: new ObjectId().toString() },
        Status.NOT_FOUND,
      );

      expect(
        (response.body as { error?: typeof UserError.UserNotFound }).error,
      ).toEqual(UserError.UserNotFound);
    });
  });
});
