import { faker } from "@faker-js/faker";
import { type Credentials, type TokenPayload } from "google-auth-library";
import { ObjectId } from "mongodb";
import * as userQueries from "@backend/user/queries/user.queries";
import {
  determineGoogleAuthMode,
  determineThirdPartyAuthMode,
  parseReconnectGoogleParams,
} from "./google.auth.util";
import { describe, expect, it, spyOn } from "bun:test";

describe("determineGoogleAuthMode", () => {
  it("returns SIGNUP when there is no linked Compass user", async () => {
    const googleUserId = faker.string.uuid();
    spyOn(userQueries, "findCanonicalCompassUser").mockResolvedValue(null);

    await expect(
      determineGoogleAuthMode(googleUserId, null, true),
    ).resolves.toEqual({
      authMode: "SIGNUP",
      compassUserId: null,
      createdNewRecipeUser: true,
    });

    expect(userQueries.findCanonicalCompassUser).toHaveBeenCalledWith({
      provider: "google",
      subjectId: googleUserId,
      email: null,
    });
  });

  it("returns SIGNIN when a Compass user is already linked", async () => {
    const user = { _id: new ObjectId() };
    spyOn(userQueries, "findCanonicalCompassUser").mockResolvedValue(
      user as Awaited<ReturnType<typeof userQueries.findCanonicalCompassUser>>,
    );

    await expect(
      determineGoogleAuthMode(faker.string.uuid(), null, false),
    ).resolves.toEqual({
      authMode: "SIGNIN",
      compassUserId: user._id.toString(),
      createdNewRecipeUser: false,
    });
  });

  it("reuses a same-email Compass user when Google is not linked yet", async () => {
    const user = { _id: new ObjectId() };
    const googleUserId = faker.string.uuid();
    spyOn(userQueries, "findCanonicalCompassUser").mockResolvedValueOnce(
      user as Awaited<ReturnType<typeof userQueries.findCanonicalCompassUser>>,
    );

    await expect(
      determineGoogleAuthMode(googleUserId, " Existing@Example.com ", false),
    ).resolves.toEqual({
      authMode: "SIGNIN",
      compassUserId: user._id.toString(),
      createdNewRecipeUser: false,
    });

    expect(userQueries.findCanonicalCompassUser).toHaveBeenCalledWith({
      provider: "google",
      subjectId: googleUserId,
      email: " Existing@Example.com ",
    });
  });
});

describe("determineThirdPartyAuthMode", () => {
  it("looks up by provider subject and returns the same SIGNUP / SIGNIN outcomes", async () => {
    const subjectId = faker.string.uuid();
    spyOn(userQueries, "findCanonicalCompassUser").mockResolvedValue(null);

    await expect(
      determineThirdPartyAuthMode("microsoft", subjectId, null, true),
    ).resolves.toEqual({
      authMode: "SIGNUP",
      compassUserId: null,
      createdNewRecipeUser: true,
    });

    expect(userQueries.findCanonicalCompassUser).toHaveBeenCalledWith({
      provider: "microsoft",
      subjectId,
      email: null,
    });
  });
});

describe("parseReconnectGoogleParams", () => {
  it("parses/validates and returns cUserId, gUser, and refreshToken", () => {
    const compassObjectId = new ObjectId();
    const compassUserId = compassObjectId.toString();

    const gUser: TokenPayload = {
      sub: faker.string.uuid(),
    } as TokenPayload;

    const refreshToken = faker.string.uuid();
    const oAuthTokens: Pick<Credentials, "refresh_token" | "access_token"> = {
      refresh_token: refreshToken,
      access_token: faker.internet.jwt(),
    };

    const parsed = parseReconnectGoogleParams(
      compassUserId,
      gUser,
      oAuthTokens,
    );

    expect(parsed).toEqual({
      cUserId: compassObjectId.toString(),
      gUser,
      refreshToken,
    });
  });

  it("throws when compassUserId is not a valid ObjectId", () => {
    const gUser: TokenPayload = {
      sub: faker.string.uuid(),
    } as TokenPayload;

    const refreshToken = faker.string.uuid();
    const oAuthTokens: Pick<Credentials, "refresh_token" | "access_token"> = {
      refresh_token: refreshToken,
      access_token: faker.internet.jwt(),
    };

    expect(() =>
      parseReconnectGoogleParams("not-an-object-id", gUser, oAuthTokens),
    ).toThrow();
  });

  it("throws when gUser.sub is empty", () => {
    const compassObjectId = new ObjectId();
    const compassUserId = compassObjectId.toString();

    const gUser: TokenPayload = {
      sub: "",
    } as TokenPayload;

    const refreshToken = faker.string.uuid();
    const oAuthTokens: Pick<Credentials, "refresh_token" | "access_token"> = {
      refresh_token: refreshToken,
      access_token: faker.internet.jwt(),
    };

    expect(() =>
      parseReconnectGoogleParams(compassUserId, gUser, oAuthTokens),
    ).toThrow();
  });

  it("throws when refresh_token is empty", () => {
    const compassObjectId = new ObjectId();
    const compassUserId = compassObjectId.toString();

    const gUser: TokenPayload = {
      sub: faker.string.uuid(),
    } as TokenPayload;

    const oAuthTokens: Pick<Credentials, "refresh_token" | "access_token"> = {
      refresh_token: "",
      access_token: faker.internet.jwt(),
    };

    expect(() =>
      parseReconnectGoogleParams(compassUserId, gUser, oAuthTokens),
    ).toThrow();
  });
});
