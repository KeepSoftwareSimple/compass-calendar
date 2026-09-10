import { faker } from "@faker-js/faker";
import { MICROSOFT_SCOPES } from "@core/providers/microsoft.scopes";
import { UserDriver } from "@backend/__tests__/drivers/user.driver";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { GOOGLE_AUTH_SCOPES } from "@backend/auth/services/google/google.auth.scopes";
import mongoService from "@backend/common/services/mongo.service";
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
let microsoftAuthService: Awaited<
  typeof import("@backend/auth/services/microsoft/microsoft.auth.service")
>["microsoftAuthService"];
let appleAuthService: Awaited<
  typeof import("@backend/auth/services/apple/apple.auth.service")
>["appleAuthService"];

describe("account linking across login methods (db)", () => {
  let adoptProviders: string[];

  beforeAll(async () => {
    spyOn(syncServiceFactory, "getSyncServiceClient").mockImplementation(
      () =>
        ({
          adoptGoogleAuthorization: async () => {
            adoptProviders.push("google");
            return {
              ok: true,
              value: {},
              correlationId: "corr-1",
            };
          },
          adoptProviderAuthorization: async (
            _principal: unknown,
            request: { provider: string },
          ) => {
            adoptProviders.push(request.provider);
            return {
              ok: true,
              value: {},
              correlationId: "corr-1",
            };
          },
          listConnections: async () => ({
            ok: true,
            value: { connections: [] },
            correlationId: "corr-1",
          }),
        }) as unknown as ReturnType<
          typeof syncServiceFactory.getSyncServiceClient
        >,
    );
    ({ googleAuthService } = await import(
      "@backend/auth/services/google/google.auth.service"
    ));
    ({ microsoftAuthService } = await import(
      "@backend/auth/services/microsoft/microsoft.auth.service"
    ));
    ({ appleAuthService } = await import(
      "@backend/auth/services/apple/apple.auth.service"
    ));
  });
  beforeEach(() => setupTestDb(import.meta.url));
  beforeEach(cleanupCollections);
  beforeEach(() => {
    adoptProviders = [];
  });
  afterAll(cleanupTestDb);

  it("links Google then Microsoft with the same verified email onto one user", async () => {
    const email = faker.internet.email().toLowerCase();
    const googleUser = UserDriver.generateGoogleUser({
      email,
      email_verified: true,
    });

    await googleAuthService.handleGoogleAuth({
      providerUser: googleUser,
      oAuthTokens: {
        refresh_token: faker.string.uuid(),
        access_token: faker.internet.jwt(),
        scope: GOOGLE_AUTH_SCOPES.join(" "),
      },
      createdNewRecipeUser: true,
      recipeUserId: faker.database.mongodbObjectId(),
      loginMethodsLength: 1,
    });

    const microsoftOid = faker.string.uuid();
    await microsoftAuthService.handleMicrosoftAuth({
      providerUser: {
        oid: microsoftOid,
        email,
        name: "Microsoft Person",
      },
      oAuthTokens: {
        refresh_token: faker.string.uuid(),
        access_token: faker.internet.jwt(),
        scope: MICROSOFT_SCOPES.join(" "),
      },
      createdNewRecipeUser: true,
      recipeUserId: faker.database.mongodbObjectId(),
      loginMethodsLength: 1,
    });

    const storedUsers = await mongoService.user.find({ email }).toArray();
    expect(storedUsers).toHaveLength(1);
    expect(storedUsers[0]?.google?.googleId).toBe(googleUser.sub);
    expect(storedUsers[0]?.identities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "google",
          subjectId: googleUser.sub,
        }),
        expect.objectContaining({
          provider: "microsoft",
          subjectId: microsoftOid,
        }),
      ]),
    );
    expect(adoptProviders).toEqual(["google", "microsoft"]);
  });

  it("does not link an unverified email/password account to a later Google sign-in", async () => {
    const existing = await UserDriver.createUser({ withGoogle: false });
    const email = existing.email.toLowerCase();
    await mongoService.user.updateOne(
      { _id: existing._id },
      { $set: { email } },
    );
    const googleUser = UserDriver.generateGoogleUser({
      email,
      email_verified: true,
    });

    await googleAuthService.handleGoogleAuth({
      providerUser: googleUser,
      oAuthTokens: {
        refresh_token: faker.string.uuid(),
        access_token: faker.internet.jwt(),
        scope: GOOGLE_AUTH_SCOPES.join(" "),
      },
      createdNewRecipeUser: true,
      recipeUserId: faker.database.mongodbObjectId(),
      loginMethodsLength: 1,
    });

    const storedUsers = await mongoService.user.find({ email }).toArray();
    expect(storedUsers).toHaveLength(2);
    const passwordUser = storedUsers.find((user) =>
      user._id.equals(existing._id),
    );
    const googleCompassUser = storedUsers.find(
      (user) => !user._id.equals(existing._id),
    );
    expect(passwordUser?.google).toBeUndefined();
    expect(googleCompassUser?.google?.googleId).toBe(googleUser.sub);
    expect(adoptProviders).toEqual(["google"]);
  });

  it("never links an Apple private-relay email onto a Google user", async () => {
    const existing = await UserDriver.createUser();
    const appleSub = faker.string.uuid();
    const relayEmail = `${faker.string.alphanumeric(8)}@privaterelay.appleid.com`;

    await appleAuthService.handleAppleAuth({
      providerUser: {
        sub: appleSub,
        email: relayEmail,
        name: "Relay Person",
      },
      oAuthTokens: {
        access_token: faker.internet.jwt(),
        scope: "openid email name",
      },
      createdNewRecipeUser: true,
      recipeUserId: faker.database.mongodbObjectId(),
      loginMethodsLength: 1,
    });

    const googleUser = await mongoService.user.findOne({ _id: existing._id });
    expect(
      googleUser?.identities?.some((identity) => identity.provider === "apple"),
    ).toBeFalsy();
    const appleUser = await mongoService.user.findOne({
      "identities.provider": "apple",
      "identities.subjectId": appleSub,
    });
    expect(appleUser).not.toBeNull();
    expect(appleUser?._id.toString()).not.toBe(existing._id.toString());
    expect(adoptProviders).toEqual([]);
  });
});
