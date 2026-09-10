import { faker } from "@faker-js/faker";
import { type Credentials, type TokenPayload } from "google-auth-library";
import { restoreFileMocks } from "@backend/__tests__/helpers/mock.setup";
import {
  GOOGLE_AUTH_SCOPES,
  GOOGLE_AUTH_SCOPES_REQUESTED,
} from "@backend/auth/services/google/google.auth.scopes";
import {
  type AuthDecision,
  type GoogleSignInSuccess,
} from "@backend/auth/services/google/google.auth.types";
import * as googleAuthUtil from "@backend/auth/services/google/util/google.auth.util";
import * as syncServiceFactory from "@backend/common/services/sync-service/sync-service.factory";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
} from "bun:test";

let googleAuthService: Awaited<
  typeof import("@backend/auth/services/google/google.auth.service")
>["googleAuthService"];

function makeProviderUser(overrides?: Partial<TokenPayload>): TokenPayload {
  return {
    sub: faker.string.uuid(),
    email: faker.internet.email(),
    email_verified: true,
    ...overrides,
  } as TokenPayload;
}

function makeOAuthTokens(): Pick<
  Credentials,
  "refresh_token" | "access_token" | "scope"
> {
  return {
    refresh_token: faker.string.uuid(),
    access_token: faker.internet.jwt(),
    scope: GOOGLE_AUTH_SCOPES.join(" "),
  };
}

function makeDecision(overrides: Partial<AuthDecision>): AuthDecision {
  return {
    authMode: "SIGNUP",
    compassUserId: null,
    createdNewRecipeUser: true,
    ...overrides,
  };
}

describe("handleGoogleAuth", () => {
  let mockDetermineGoogleAuthMode: Mock<
    typeof googleAuthUtil.determineGoogleAuthMode
  >;
  let adoptCalls: Array<[unknown, unknown]>;

  beforeAll(async () => {
    mockDetermineGoogleAuthMode = spyOn(
      googleAuthUtil,
      "determineGoogleAuthMode",
    );
    ({ googleAuthService } = await import(
      "@backend/auth/services/google/google.auth.service"
    ));
    spyOn(googleAuthService, "repairGoogleConnection").mockResolvedValue({
      cUserId: "repair-id",
      refreshToken: faker.string.uuid(),
    });
    spyOn(googleAuthService, "googleSignup").mockResolvedValue({
      cUserId: "signup-id",
      refreshToken: faker.string.uuid(),
    });
    spyOn(syncServiceFactory, "getSyncServiceClient").mockImplementation(
      () =>
        ({
          listConnections: async () => ({
            ok: true,
            value: { connections: [] },
            correlationId: "corr-1",
          }),
          adoptGoogleAuthorization: async (...args: [unknown, unknown]) => {
            adoptCalls.push(args);
            return { ok: true, value: {}, correlationId: "corr-1" };
          },
        }) as unknown as ReturnType<typeof syncServiceFactory.getSyncServiceClient>,
    );
  });

  beforeEach(() => {
    mockDetermineGoogleAuthMode.mockReset();
    adoptCalls = [];
    (googleAuthService.repairGoogleConnection as Mock).mockClear();
    (googleAuthService.googleSignup as Mock).mockClear();
  });

  afterAll(() => {
    restoreFileMocks();
  });

  describe("signup path", () => {
    it("calls googleSignup when no existing Compass user found", async () => {
      const providerUser = makeProviderUser();
      const oAuthTokens = makeOAuthTokens();
      const recipeUserId = faker.database.mongodbObjectId();

      mockDetermineGoogleAuthMode.mockResolvedValue(
        makeDecision({ authMode: "SIGNUP" }),
      );

      const success: GoogleSignInSuccess = {
        providerUser,
        oAuthTokens,
        createdNewRecipeUser: true,
        recipeUserId,
        loginMethodsLength: 1,
      };

      await googleAuthService.handleGoogleAuth(success);

      expect(googleAuthService.googleSignup).toHaveBeenCalledTimes(1);
      expect(googleAuthService.googleSignup).toHaveBeenCalledWith(
        providerUser,
        oAuthTokens.refresh_token,
        recipeUserId,
      );
      expect(googleAuthService.repairGoogleConnection).not.toHaveBeenCalled();
      expect(adoptCalls).toHaveLength(1);
      expect(adoptCalls[0]).toEqual([
        { tenantId: "signup-id", principalId: "signup-id" },
        expect.objectContaining({
          account: expect.objectContaining({
            providerAccountId: providerUser.sub,
          }),
          refreshToken: expect.any(String),
          grantedScopes: expect.arrayContaining([
            "https://www.googleapis.com/auth/calendar.events",
          ]),
        }),
      ]);
    });

    it("throws when refresh_token is missing for new user", async () => {
      const success: GoogleSignInSuccess = {
        providerUser: makeProviderUser(),
        oAuthTokens: {
          access_token: faker.internet.jwt(),
          scope: GOOGLE_AUTH_SCOPES.join(" "),
        },
        createdNewRecipeUser: true,
        recipeUserId: faker.database.mongodbObjectId(),
        loginMethodsLength: 1,
      };

      mockDetermineGoogleAuthMode.mockResolvedValue(
        makeDecision({ authMode: "SIGNUP" }),
      );

      await expect(
        googleAuthService.handleGoogleAuth(success),
      ).rejects.toMatchObject({
        result: "Refresh token expected for new user sign-up",
        code: "GOOGLE_REFRESH_TOKEN_MISSING",
      });

      expect(googleAuthService.googleSignup).not.toHaveBeenCalled();
      expect(adoptCalls).toHaveLength(0);
    });

    it("rejects missing server-returned calendar scopes before sign-up", async () => {
      const success: GoogleSignInSuccess = {
        providerUser: makeProviderUser(),
        oAuthTokens: {
          access_token: faker.internet.jwt(),
          refresh_token: faker.string.uuid(),
          scope: "https://www.googleapis.com/auth/userinfo.email",
        },
        createdNewRecipeUser: true,
        recipeUserId: faker.database.mongodbObjectId(),
        loginMethodsLength: 1,
      };
      mockDetermineGoogleAuthMode.mockResolvedValue(
        makeDecision({ authMode: "SIGNUP" }),
      );

      await expect(
        googleAuthService.handleGoogleAuth(success),
      ).rejects.toMatchObject({
        result: "Google Calendar permissions are required",
      });
      expect(googleAuthService.googleSignup).not.toHaveBeenCalled();
      expect(adoptCalls).toHaveLength(0);
    });

    it("signs up successfully with the verified calendar scopes", async () => {
      // Sign-in requests only the verified Calendar scopes. Contacts, when
      // enabled, are authorized separately through the Sync feature flow.
      const providerUser = makeProviderUser();
      expect(GOOGLE_AUTH_SCOPES_REQUESTED).toEqual(GOOGLE_AUTH_SCOPES);
      const success: GoogleSignInSuccess = {
        providerUser,
        oAuthTokens: {
          access_token: faker.internet.jwt(),
          refresh_token: faker.string.uuid(),
          scope: GOOGLE_AUTH_SCOPES.join(" "),
        },
        createdNewRecipeUser: true,
        recipeUserId: faker.database.mongodbObjectId(),
        loginMethodsLength: 1,
      };
      mockDetermineGoogleAuthMode.mockResolvedValue(
        makeDecision({ authMode: "SIGNUP" }),
      );

      await googleAuthService.handleGoogleAuth(success);

      expect(googleAuthService.googleSignup).toHaveBeenCalledTimes(1);
      expect(adoptCalls).toHaveLength(1);
    });

    it("does not create a user when an existing session would otherwise SIGNUP", async () => {
      const success: GoogleSignInSuccess = {
        providerUser: makeProviderUser(),
        oAuthTokens: makeOAuthTokens(),
        createdNewRecipeUser: true,
        recipeUserId: faker.database.mongodbObjectId(),
        loginMethodsLength: 1,
      };

      mockDetermineGoogleAuthMode.mockResolvedValue(
        makeDecision({ authMode: "SIGNUP" }),
      );

      await expect(
        googleAuthService.handleGoogleAuth(success, {
          hasExistingSession: true,
        }),
      ).rejects.toMatchObject({
        result:
          "You're already signed in. Use Settings → Add account to connect this Google account.",
        code: "GOOGLE_SIGNIN_WHILE_AUTHENTICATED",
      });

      expect(googleAuthService.googleSignup).not.toHaveBeenCalled();
      expect(adoptCalls).toHaveLength(0);
    });
  });

  describe("SIGNIN path", () => {
    it("calls repairGoogleConnection for a returning user", async () => {
      const compassUserId = faker.database.mongodbObjectId();
      const providerUser = makeProviderUser();
      const oAuthTokens = makeOAuthTokens();

      mockDetermineGoogleAuthMode.mockResolvedValue(
        makeDecision({
          authMode: "SIGNIN",
          compassUserId,
          createdNewRecipeUser: false,
        }),
      );

      const success: GoogleSignInSuccess = {
        providerUser,
        oAuthTokens,
        createdNewRecipeUser: false,
        recipeUserId: compassUserId,
        loginMethodsLength: 1,
      };

      await googleAuthService.handleGoogleAuth(success);

      expect(googleAuthService.repairGoogleConnection).toHaveBeenCalledTimes(1);
      expect(googleAuthService.repairGoogleConnection).toHaveBeenCalledWith(
        compassUserId,
        providerUser,
        oAuthTokens,
      );
      expect(googleAuthService.googleSignup).not.toHaveBeenCalled();
      expect(adoptCalls).toHaveLength(1);
    });
  });

  describe("auth decision logging", () => {
    it("determines correct auth mode for each scenario", async () => {
      mockDetermineGoogleAuthMode.mockResolvedValueOnce(
        makeDecision({ authMode: "SIGNUP" }),
      );
      await googleAuthService.handleGoogleAuth({
        providerUser: makeProviderUser(),
        oAuthTokens: makeOAuthTokens(),
        createdNewRecipeUser: true,
        recipeUserId: faker.database.mongodbObjectId(),
        loginMethodsLength: 1,
      });
      expect(googleAuthService.googleSignup).toHaveBeenCalled();

      const signinUserId = faker.database.mongodbObjectId();
      mockDetermineGoogleAuthMode.mockResolvedValueOnce(
        makeDecision({
          authMode: "SIGNIN",
          compassUserId: signinUserId,
          createdNewRecipeUser: false,
        }),
      );
      await googleAuthService.handleGoogleAuth({
        providerUser: makeProviderUser(),
        oAuthTokens: makeOAuthTokens(),
        createdNewRecipeUser: false,
        recipeUserId: signinUserId,
        loginMethodsLength: 1,
      });
      expect(googleAuthService.repairGoogleConnection).toHaveBeenCalled();
    });
  });
});
