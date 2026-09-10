import { faker } from "@faker-js/faker";
import { type Credentials, type TokenPayload } from "google-auth-library";
import { UserDriver } from "@backend/__tests__/drivers/user.driver";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { getTestLoggerInfoCalls } from "@backend/__tests__/helpers/mock.setup";
import * as googleAuthUtil from "@backend/auth/services/google/util/google.auth.util";
import mongoService from "@backend/common/services/mongo.service";
import * as syncServiceFactory from "@backend/common/services/sync-service/sync-service.factory";
import userMetadataService from "@backend/user/services/user-metadata.service";
import { GOOGLE_AUTH_SCOPES } from "./google.auth.scopes";
import {
  type AuthDecision,
  type GoogleSignInSuccess,
} from "./google.auth.types";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
} from "bun:test";

let googleAuthService: Awaited<
  typeof import("./google.auth.service")
>["googleAuthService"];

describe("googleAuthService", () => {
  beforeAll(async () => {
    spyOn(googleAuthUtil, "determineGoogleAuthMode");
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      adoptGoogleAuthorization: async () => ({
        ok: true,
        value: {},
        correlationId: "corr-1",
      }),
      listConnections: async () => ({
        ok: true,
        value: { connections: [] },
        correlationId: "corr-1",
      }),
    } as unknown as ReturnType<typeof syncServiceFactory.getSyncServiceClient>);
    ({ googleAuthService } = await import("./google.auth.service"));
  });
  beforeEach(() => setupTestDb(import.meta.url));
  beforeEach(cleanupCollections);
  afterAll(cleanupTestDb);

  describe("handleGoogleAuth", () => {
    const mockDetermineGoogleAuthMode = () =>
      googleAuthUtil.determineGoogleAuthMode as Mock<
        typeof googleAuthUtil.determineGoogleAuthMode
      >;

    const makeProviderUser = (overrides?: Partial<TokenPayload>) =>
      ({
        sub: faker.string.uuid(),
        email: faker.internet.email(),
        email_verified: true,
        ...overrides,
      }) as TokenPayload;

    const makeOAuthTokens = () =>
      ({
        refresh_token: faker.string.uuid(),
        access_token: faker.internet.jwt(),
        scope: GOOGLE_AUTH_SCOPES.join(" "),
      }) as Pick<Credentials, "refresh_token" | "access_token" | "scope">;

    const makeOAuthTokensNoRefresh = () =>
      ({
        access_token: faker.internet.jwt(),
        scope: GOOGLE_AUTH_SCOPES.join(" "),
      }) as Pick<Credentials, "refresh_token" | "access_token" | "scope">;

    beforeEach(() => {
      mockDetermineGoogleAuthMode().mockReset();
      spyOn(googleAuthService, "googleSignup").mockResolvedValue({
        cUserId: "signup-id",
        refreshToken: faker.string.uuid(),
      });
      spyOn(googleAuthService, "repairGoogleConnection").mockResolvedValue({
        cUserId: "repair-id",
        refreshToken: faker.string.uuid(),
      });
    });

    afterEach(() => {
      // These spies are only needed for the `handleGoogleAuth` routing tests.
      // Without restoring, they can leak into the `repairGoogleConnection`
      // describe block below and cause unrelated assertions to fail.
      (googleAuthService.googleSignup as Mock).mockRestore();
      (googleAuthService.repairGoogleConnection as Mock).mockRestore();
    });

    it("routes SIGNUP to googleSignup", async () => {
      const providerUser = makeProviderUser({ sub: faker.string.uuid() });
      const recipeUserId = faker.database.mongodbObjectId();
      const oAuthTokens = makeOAuthTokens();

      const success: GoogleSignInSuccess = {
        providerUser,
        oAuthTokens,
        createdNewRecipeUser: true,
        recipeUserId,
        loginMethodsLength: 1,
      };

      const decision: AuthDecision = {
        authMode: "SIGNUP",
        compassUserId: null,
        createdNewRecipeUser: true,
      };

      mockDetermineGoogleAuthMode().mockResolvedValue(decision);

      await googleAuthService.handleGoogleAuth(success);

      expect(googleAuthService.googleSignup).toHaveBeenCalledWith(
        providerUser,
        oAuthTokens.refresh_token,
        recipeUserId,
      );
    });

    it("throws when refresh_token is missing on SIGNUP", async () => {
      const providerUser = makeProviderUser();
      const recipeUserId = faker.database.mongodbObjectId();
      const oAuthTokens = makeOAuthTokensNoRefresh();

      const success: GoogleSignInSuccess = {
        providerUser,
        oAuthTokens,
        createdNewRecipeUser: true,
        recipeUserId,
        loginMethodsLength: 1,
      };

      const decision: AuthDecision = {
        authMode: "SIGNUP",
        compassUserId: null,
        createdNewRecipeUser: true,
      };

      mockDetermineGoogleAuthMode().mockResolvedValue(decision);

      await expect(
        googleAuthService.handleGoogleAuth(success),
      ).rejects.toMatchObject({
        result: "Refresh token expected for new user sign-up",
        code: "GOOGLE_REFRESH_TOKEN_MISSING",
      });
    });

    it("routes SIGNIN to repairGoogleConnection", async () => {
      const providerUser = makeProviderUser();
      const recipeUserId = faker.database.mongodbObjectId();

      const oAuthTokens = makeOAuthTokens();
      const success: GoogleSignInSuccess = {
        providerUser,
        oAuthTokens,
        createdNewRecipeUser: false,
        recipeUserId,
        loginMethodsLength: 1,
      };

      const decision: AuthDecision = {
        authMode: "SIGNIN",
        compassUserId: faker.string.uuid(),
        createdNewRecipeUser: false,
      };

      mockDetermineGoogleAuthMode().mockResolvedValue(decision);

      await googleAuthService.handleGoogleAuth(success);

      expect(googleAuthService.repairGoogleConnection).toHaveBeenCalledWith(
        decision.compassUserId!,
        providerUser,
        oAuthTokens,
      );
    });

    it("logs a production-safe auth decision trace without raw identifiers", async () => {
      const providerUser = makeProviderUser({
        email: "Trace.Person@example.com",
        sub: "google-user-123",
      });
      const recipeUserId = faker.database.mongodbObjectId();
      const compassUserId = faker.database.mongodbObjectId();
      const oAuthTokens = makeOAuthTokens();

      const success: GoogleSignInSuccess = {
        providerUser,
        oAuthTokens,
        createdNewRecipeUser: false,
        recipeUserId,
        loginMethodsLength: 2,
      };

      const decision: AuthDecision = {
        authMode: "SIGNIN",
        compassUserId,
        createdNewRecipeUser: false,
      };

      mockDetermineGoogleAuthMode().mockResolvedValue(decision);

      await googleAuthService.handleGoogleAuth(success);

      const decisionCall = getTestLoggerInfoCalls(
        "app:auth.google.service",
      ).find(([message]) => message === "google_auth_decision");

      expect(decisionCall).toBeDefined();
      expect(decisionCall![0]).toBe("google_auth_decision");
      expect(decisionCall![1]).toEqual(
        expect.objectContaining({
          authMode: "SIGNIN",
          compassUserTraceId: expect.any(String),
          createdNewRecipeUser: false,
          googleUserTraceId: expect.any(String),
          hasCompassUserId: true,
          hasGoogleUserId: true,
          hasProviderEmail: true,
          loginMethodsLength: 2,
          providerEmailTraceId: expect.any(String),
        }),
      );

      const tracePayload = decisionCall![1];
      const serializedTrace = JSON.stringify(tracePayload);

      expect(tracePayload).not.toHaveProperty("compassUserId");
      expect(tracePayload).not.toHaveProperty("googleUserId");
      expect(tracePayload).not.toHaveProperty("providerEmail");
      expect(serializedTrace).not.toContain(compassUserId);
      expect(serializedTrace).not.toContain(providerUser.email);
      expect(serializedTrace).not.toContain(providerUser.sub);
    });
  });

  describe("repairGoogleConnection", () => {
    const mockDetermineGoogleAuthMode = () =>
      googleAuthUtil.determineGoogleAuthMode as Mock<
        typeof googleAuthUtil.determineGoogleAuthMode
      >;

    it("relinks Google profile facts and reports the fresh refresh token", async () => {
      const user = await UserDriver.createUser();
      const compassUserId = user._id.toString();
      const gUser = UserDriver.generateGoogleUser({
        email: user.email,
        sub: faker.string.uuid(),
        picture: faker.image.url(),
      });
      const oAuthTokens: Pick<Credentials, "access_token" | "refresh_token"> = {
        access_token: faker.internet.jwt(),
        refresh_token: faker.string.uuid(),
      };

      // Simulate a revoked/lost Google connection before the repair.
      await mongoService.user.updateOne(
        { _id: user._id },
        { $set: { "google.gRefreshToken": "" } },
      );

      const result: { cUserId: string; refreshToken: string | null } =
        await googleAuthService.repairGoogleConnection(
          compassUserId,
          gUser,
          oAuthTokens,
        );

      const updatedUser = await mongoService.user.findOne({ _id: user._id });
      const metadata =
        await userMetadataService.fetchUserMetadata(compassUserId);

      expect(result).toEqual({
        cUserId: compassUserId,
        refreshToken: oAuthTokens.refresh_token,
      });
      expect(updatedUser?._id.toString()).toBe(compassUserId);
      expect(updatedUser?.google?.googleId).toBe(gUser.sub);
      expect(updatedUser?.google?.picture).toBe(gUser.picture);
      // The credential itself lives only in Sync now; the legacy slot stays
      // clear even on a repair that received a fresh token.
      expect(updatedUser?.google?.gRefreshToken).toBeUndefined();
      // metadata untouched: the legacy sync restart flags were retired.
      expect(metadata.sync).toBeUndefined();
    });

    it("signs a returning user in without adopting when Google returns no refresh token", async () => {
      // Sync either already holds a live connection for the account (adoption
      // would no-op) or the user must run the reconnect flow for a fresh
      // token; sign-in itself proceeds and profile facts still refresh.
      const user = await UserDriver.createUser();
      const compassUserId = user._id.toString();
      const providerUser = UserDriver.generateGoogleUser({
        email: user.email,
        sub: user.google?.googleId,
        picture: faker.image.url(),
      });

      mockDetermineGoogleAuthMode().mockResolvedValue({
        authMode: "SIGNIN",
        compassUserId,
        createdNewRecipeUser: false,
      });

      await expect(
        googleAuthService.handleGoogleAuth({
          providerUser,
          oAuthTokens: {
            access_token: faker.internet.jwt(),
            scope: GOOGLE_AUTH_SCOPES.join(" "),
          },
          createdNewRecipeUser: false,
          recipeUserId: compassUserId,
          loginMethodsLength: 1,
        }),
      ).resolves.toBeUndefined();

      const updatedUser = await mongoService.user.findOne({ _id: user._id });
      expect(updatedUser?.google?.picture).toBe(providerUser.picture);
    });
  });

  describe("googleSignup", () => {
    it("does not attach Google onto an unverified password-only Compass user", async () => {
      const existingUser = await UserDriver.createUser({ withGoogle: false });
      const normalizedEmail = existingUser.email.toLowerCase();
      await mongoService.user.updateOne(
        { _id: existingUser._id },
        { $set: { email: normalizedEmail } },
      );
      const recipeUserId = faker.database.mongodbObjectId();
      const providerUser = {
        sub: faker.string.uuid(),
        email: normalizedEmail.toUpperCase(),
        name: faker.person.fullName(),
        picture: faker.image.url(),
      } as TokenPayload;
      const refreshToken = faker.string.uuid();

      const result = await googleAuthService.googleSignup(
        providerUser,
        refreshToken,
        recipeUserId,
      );

      const storedUsers = await mongoService.user
        .find({ email: normalizedEmail })
        .toArray();
      const googleUser = storedUsers.find(
        (user) => !user._id.equals(existingUser._id),
      );

      expect(storedUsers).toHaveLength(2);
      expect(result).toEqual({
        cUserId: recipeUserId,
        refreshToken,
      });
      expect(googleUser?.google?.googleId).toBe(providerUser.sub);
      expect(
        storedUsers.find((user) => user._id.equals(existingUser._id))?.google,
      ).toBeUndefined();
    });
  });
});
