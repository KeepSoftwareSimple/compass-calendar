import { faker } from "@faker-js/faker";
import { GOOGLE_SCOPE_CALENDAR_EVENTS } from "@core/providers/google.scopes";
import { UserDriver } from "@backend/__tests__/drivers/user.driver";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import mongoService from "@backend/common/services/mongo.service";
import * as syncServiceFactory from "@backend/common/services/sync-service/sync-service.factory";
import { type AppleSignInSuccess } from "./apple.auth.types";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
} from "bun:test";
import { createHmac } from "node:crypto";

let appleAuthService: Awaited<
  typeof import("./apple.auth.service")
>["appleAuthService"];

const signTestIdToken = (payload: Record<string, unknown>): string => {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", "apple-test-secret")
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
};

const payloadFromIdToken = (idToken: string): Record<string, unknown> =>
  JSON.parse(
    Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8"),
  ) as Record<string, unknown>;

describe("appleAuthService", () => {
  let adoptCalls: unknown[];

  beforeAll(async () => {
    spyOn(syncServiceFactory, "getSyncServiceClient").mockImplementation(
      () =>
        ({
          adoptProviderAuthorization: async (...args: unknown[]) => {
            adoptCalls.push(args);
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
    ({ appleAuthService } = await import("./apple.auth.service"));
  });
  beforeEach(() => setupTestDb(import.meta.url));
  beforeEach(cleanupCollections);
  beforeEach(() => {
    adoptCalls = [];
  });
  afterAll(cleanupTestDb);

  const makeSuccess = (
    overrides?: Partial<AppleSignInSuccess>,
  ): AppleSignInSuccess => {
    const sub = faker.string.uuid();
    const email = `${faker.string.alphanumeric(8)}@privaterelay.appleid.com`;
    const idToken = signTestIdToken({
      sub,
      email,
      email_verified: "true",
      user: {
        name: { firstName: "Ada", lastName: "Lovelace" },
      },
    });
    const payload = payloadFromIdToken(idToken);
    return {
      providerUser: {
        sub: typeof payload["sub"] === "string" ? payload["sub"] : sub,
        email: typeof payload["email"] === "string" ? payload["email"] : email,
        user:
          payload["user"] && typeof payload["user"] === "object"
            ? (payload["user"] as AppleSignInSuccess["providerUser"]["user"])
            : undefined,
      },
      oAuthTokens: {
        access_token: faker.internet.jwt(),
        scope: "openid email name",
      },
      createdNewRecipeUser: true,
      recipeUserId: faker.database.mongodbObjectId(),
      loginMethodsLength: 1,
      ...overrides,
    };
  };

  it("stores the name and an apple identity keyed by sub on first sign-in", async () => {
    const success = makeSuccess();

    await appleAuthService.handleAppleAuth(success);

    const stored = await mongoService.user.findOne({
      "identities.provider": "apple",
      "identities.subjectId": success.providerUser.sub,
    });
    expect(stored?.name).toBe("Ada Lovelace");
    expect(stored?.identities).toEqual([
      expect.objectContaining({
        provider: "apple",
        subjectId: success.providerUser.sub,
        email: success.providerUser.email,
        displayName: "Ada Lovelace",
      }),
    ]);
    expect(stored?.google).toBeUndefined();
    expect(adoptCalls).toHaveLength(0);
  });

  it("resolves a second sign-in with a different relay email to the same user", async () => {
    const first = makeSuccess();
    await appleAuthService.handleAppleAuth(first);

    const nextRelay = `${faker.string.alphanumeric(8)}@privaterelay.appleid.com`;
    await appleAuthService.handleAppleAuth({
      ...first,
      createdNewRecipeUser: false,
      recipeUserId: faker.database.mongodbObjectId(),
      providerUser: {
        ...first.providerUser,
        email: nextRelay,
        user: undefined,
        name: undefined,
      },
    });

    const storedUsers = await mongoService.user
      .find({
        "identities.provider": "apple",
        "identities.subjectId": first.providerUser.sub,
      })
      .toArray();
    expect(storedUsers).toHaveLength(1);
    expect(storedUsers[0]?.name).toBe("Ada Lovelace");
    expect(storedUsers[0]?.identities).toEqual([
      expect.objectContaining({
        provider: "apple",
        subjectId: first.providerUser.sub,
      }),
    ]);
    expect(adoptCalls).toHaveLength(0);
  });

  it("links a non-relay Apple email onto the Google user that already owns it", async () => {
    const existing = await UserDriver.createUser();
    const normalizedEmail = existing.email.toLowerCase();
    await mongoService.user.updateOne(
      { _id: existing._id },
      { $set: { email: normalizedEmail } },
    );
    const success = makeSuccess({
      providerUser: {
        sub: faker.string.uuid(),
        email: normalizedEmail,
        name: "Apple Person",
      },
    });

    await appleAuthService.handleAppleAuth(success);

    const storedUsers = await mongoService.user
      .find({ email: normalizedEmail })
      .toArray();
    expect(storedUsers).toHaveLength(1);
    expect(storedUsers[0]?._id).toEqual(existing._id);
    expect(storedUsers[0]?.identities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "google",
          subjectId: existing.google?.googleId,
        }),
        expect.objectContaining({
          provider: "apple",
          subjectId: success.providerUser.sub,
          email: normalizedEmail,
        }),
      ]),
    );
    expect(adoptCalls).toHaveLength(0);
  });

  it("never links an Apple private-relay email onto another Compass user", async () => {
    const existing = await UserDriver.createUser();
    const success = makeSuccess();

    await appleAuthService.handleAppleAuth(success);

    const googleUser = await mongoService.user.findOne({ _id: existing._id });
    expect(googleUser?.identities?.some((i) => i.provider === "apple")).toBe(
      false,
    );
    const appleUser = await mongoService.user.findOne({
      "identities.provider": "apple",
      "identities.subjectId": success.providerUser.sub,
    });
    expect(appleUser?._id.equals(existing._id)).toBe(false);
    expect(adoptCalls).toHaveLength(0);
  });

  it("adopts a calendar connection when the grant includes a calendar scope", async () => {
    const success = makeSuccess({
      oAuthTokens: {
        access_token: faker.internet.jwt(),
        refresh_token: faker.internet.jwt(),
        scope: `openid email ${GOOGLE_SCOPE_CALENDAR_EVENTS}`,
      },
    });

    await appleAuthService.handleAppleAuth(success);

    expect(adoptCalls).toHaveLength(1);
  });
});
