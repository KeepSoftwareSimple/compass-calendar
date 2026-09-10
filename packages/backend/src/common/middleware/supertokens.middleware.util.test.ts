import { faker } from "@faker-js/faker";
import { registerUserIdMappingStore } from "@backend/auth/ports/supertokens.registry";
import { createInMemoryUserIdMappingStore } from "@backend/auth/ports/supertokens.stores";
import {
  buildResetPasswordLink,
  createAppleSignInSuccess,
  createGoogleSignInSuccess,
  createMicrosoftSignInSuccess,
  ensureExternalUserIdMapping,
  getFormFieldValue,
  maybeReplaceEmailPasswordSession,
  withAppleFirstAuthorizationName,
} from "@backend/common/middleware/supertokens.middleware.util";
import { beforeEach, describe, expect, it, mock } from "bun:test";

describe("supertokens.middleware.util", () => {
  beforeEach(() => {
    registerUserIdMappingStore(createInMemoryUserIdMappingStore());
  });

  describe("ensureExternalUserIdMapping", () => {
    it("returns the existing external user id mapping", async () => {
      const recipeUserId = faker.database.mongodbObjectId();
      const externalUserId = faker.database.mongodbObjectId();
      const store = createInMemoryUserIdMappingStore();
      await store.createUserIdMapping({
        superTokensUserId: recipeUserId,
        externalUserId,
      });
      registerUserIdMappingStore(store);

      await expect(ensureExternalUserIdMapping(recipeUserId)).resolves.toBe(
        externalUserId,
      );
    });

    it("creates a new external user id mapping when one does not exist", async () => {
      const recipeUserId = faker.database.mongodbObjectId();

      const externalUserId = await ensureExternalUserIdMapping(recipeUserId);

      expect(externalUserId).toMatch(/^[a-f0-9]{24}$/);
      await expect(ensureExternalUserIdMapping(recipeUserId)).resolves.toBe(
        externalUserId,
      );
    });
  });

  describe("getFormFieldValue", () => {
    it("returns the string value for the matching field", () => {
      const email = faker.internet.email();
      const name = faker.person.fullName();

      expect(
        getFormFieldValue(
          [
            { id: "email", value: email },
            { id: "name", value: name },
          ],
          "name",
        ),
      ).toBe(name);
    });

    it("returns undefined for missing or non-string fields", () => {
      expect(
        getFormFieldValue(
          [
            { id: "email", value: faker.internet.email() },
            { id: "name", value: 123 },
          ],
          "name",
        ),
      ).toBeUndefined();

      expect(getFormFieldValue([], "name")).toBeUndefined();
    });
  });

  describe("buildResetPasswordLink", () => {
    it("rewrites reset links into the app auth flow", () => {
      const token = faker.string.alphanumeric(32);
      const frontendUrl = "http://localhost:9080";

      expect(
        buildResetPasswordLink(
          `http://localhost:3567/auth/reset-password?token=${token}`,
          frontendUrl,
        ),
      ).toBe(`http://localhost:9080/day?auth=reset&token=${token}`);
    });

    it("returns the original link when the token is missing", () => {
      const passwordResetLink =
        "http://localhost:3567/auth/reset-password?foo=bar";

      expect(
        buildResetPasswordLink(passwordResetLink, "http://localhost:9080"),
      ).toBe(passwordResetLink);
    });
  });

  describe("createGoogleSignInSuccess", () => {
    it("returns null for non-OK responses", () => {
      expect(
        createGoogleSignInSuccess({
          status: "SIGN_IN_UP_NOT_ALLOWED",
        } as Parameters<typeof createGoogleSignInSuccess>[0]),
      ).toBeNull();
    });

    it("embeds reconnect fallback user id into the auth success payload", () => {
      const recipeUserId = faker.database.mongodbObjectId();
      const success = createGoogleSignInSuccess({
        status: "OK",
        rawUserInfoFromProvider: {
          fromIdTokenPayload: {
            sub: faker.string.uuid(),
            email: faker.internet.email(),
          },
        },
        oAuthTokens: {
          refresh_token: faker.string.uuid(),
          access_token: faker.internet.jwt(),
        },
        createdNewRecipeUser: false,
        user: {
          id: recipeUserId,
          loginMethods: [{}],
        },
      } as Parameters<typeof createGoogleSignInSuccess>[0]);

      expect(success).toMatchObject({
        createdNewRecipeUser: false,
        recipeUserId,
        loginMethodsLength: 1,
      });
    });
  });

  describe("createMicrosoftSignInSuccess", () => {
    it("reads oid and email from the Active Directory id token payload", () => {
      const recipeUserId = faker.database.mongodbObjectId();
      const oid = faker.string.uuid();
      const email = faker.internet.email();

      const success = createMicrosoftSignInSuccess({
        status: "OK",
        createdNewRecipeUser: true,
        rawUserInfoFromProvider: {
          fromIdTokenPayload: {
            oid,
            email,
            name: "Microsoft Person",
          },
        },
        oAuthTokens: {
          refresh_token: faker.string.uuid(),
          access_token: faker.internet.jwt(),
          scope: "openid profile email",
        },
        user: {
          id: recipeUserId,
          loginMethods: [{}],
        },
      } as unknown as Parameters<typeof createMicrosoftSignInSuccess>[0]);

      expect(success).toMatchObject({
        createdNewRecipeUser: true,
        recipeUserId,
        loginMethodsLength: 1,
        providerUser: { oid, email, name: "Microsoft Person" },
      });
    });
  });

  describe("createAppleSignInSuccess", () => {
    it("reads sub, email, and first-authorization name from the id token payload", () => {
      const recipeUserId = faker.database.mongodbObjectId();
      const sub = faker.string.uuid();
      const email = `${faker.string.alphanumeric(8)}@privaterelay.appleid.com`;

      const success = createAppleSignInSuccess({
        status: "OK",
        createdNewRecipeUser: true,
        rawUserInfoFromProvider: {
          fromIdTokenPayload: {
            sub,
            email,
            user: { name: { firstName: "Ada", lastName: "Lovelace" } },
          },
        },
        oAuthTokens: {
          access_token: faker.internet.jwt(),
          scope: "openid email name",
        },
        user: {
          id: recipeUserId,
          loginMethods: [{}],
        },
      } as unknown as Parameters<typeof createAppleSignInSuccess>[0]);

      expect(success).toMatchObject({
        createdNewRecipeUser: true,
        recipeUserId,
        loginMethodsLength: 1,
        providerUser: {
          sub,
          email,
          user: { name: { firstName: "Ada", lastName: "Lovelace" } },
        },
      });
    });

    it("reads the first-authorization name from fromUserInfoAPI when the id token omits it", () => {
      const recipeUserId = faker.database.mongodbObjectId();
      const sub = faker.string.uuid();

      const success = createAppleSignInSuccess({
        status: "OK",
        createdNewRecipeUser: true,
        rawUserInfoFromProvider: {
          fromIdTokenPayload: { sub, email: "a@privaterelay.appleid.com" },
          fromUserInfoAPI: {
            name: { firstName: "Ada", lastName: "Lovelace" },
          },
        },
        oAuthTokens: { access_token: faker.internet.jwt() },
        user: { id: recipeUserId, loginMethods: [{}] },
      } as unknown as Parameters<typeof createAppleSignInSuccess>[0]);

      expect(success?.providerUser.user).toEqual({
        name: { firstName: "Ada", lastName: "Lovelace" },
      });
    });
  });

  describe("withAppleFirstAuthorizationName", () => {
    it("attaches Apple's form_post user JSON when the id token has no name", () => {
      const recipeUserId = faker.database.mongodbObjectId();
      const success = createAppleSignInSuccess({
        status: "OK",
        createdNewRecipeUser: true,
        rawUserInfoFromProvider: {
          fromIdTokenPayload: {
            sub: faker.string.uuid(),
            email: "a@privaterelay.appleid.com",
          },
        },
        oAuthTokens: { access_token: faker.internet.jwt() },
        user: { id: recipeUserId, loginMethods: [{}] },
      } as unknown as Parameters<typeof createAppleSignInSuccess>[0]);

      expect(success).not.toBeNull();
      const merged = withAppleFirstAuthorizationName(
        success!,
        JSON.stringify({ name: { firstName: "Ada", lastName: "Lovelace" } }),
      );
      expect(merged.providerUser.user).toEqual({
        name: { firstName: "Ada", lastName: "Lovelace" },
      });
    });
  });

  describe("maybeReplaceEmailPasswordSession", () => {
    it("returns the original response when the session already belongs to the canonical Compass user", async () => {
      const input = {
        formFields: [],
        options: { req: {}, res: {} },
      } as unknown as Parameters<typeof maybeReplaceEmailPasswordSession>[0];
      const response = {
        status: "OK" as const,
        session: {
          getHandle: () => "existing-session",
          getUserId: () => "compass-user-id",
        },
      } as Parameters<typeof maybeReplaceEmailPasswordSession>[1];
      const replaceSession = mock();

      const result = await maybeReplaceEmailPasswordSession(
        input,
        response,
        "compass-user-id",
        replaceSession,
      );

      expect(result).toBe(response);
      expect(replaceSession).not.toHaveBeenCalled();
    });

    it("replaces the response session when SuperTokens returned a different user id", async () => {
      const input = {
        formFields: [],
        options: { req: {}, res: {} },
      } as unknown as Parameters<typeof maybeReplaceEmailPasswordSession>[0];
      const existingSession = {
        getHandle: () => "existing-session",
        getUserId: () => "recipe-user-id",
      };
      const replacementSession = {
        getHandle: () => "compass-session",
        getUserId: () => "compass-user-id",
      };
      const response = {
        status: "OK" as const,
        session: existingSession,
      } as Parameters<typeof maybeReplaceEmailPasswordSession>[1];
      const replaceSession = mock().mockResolvedValue(replacementSession);

      const result = await maybeReplaceEmailPasswordSession(
        input,
        response,
        "compass-user-id",
        replaceSession,
      );

      expect(replaceSession).toHaveBeenCalledWith(
        input,
        existingSession,
        "compass-user-id",
      );
      expect(result).toMatchObject({ status: "OK" });
    });
  });
});
