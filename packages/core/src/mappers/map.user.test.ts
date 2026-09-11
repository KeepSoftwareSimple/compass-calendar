import { type TokenPayload } from "google-auth-library";
import { BaseError } from "../errors/errors.base";
import {
  mapUserToCompass,
  mergeGoogleLoginIdentity,
  mergeLoginIdentities,
} from "./map.user";

describe("Map to Compass", () => {
  it("adds placeholders for acceptible fields", () => {
    const gUser = {
      iss: "https://accounts.google.com",
      azp: "111111520146-mqq17c111hgpgn907j79kgnse1o0lchk.apps.googleusercontent.com",
      aud: "111111520146-mqq17c111hgpgn907j79kgnse1o0lchk.apps.googleusercontent.com",
      sub: "777777778083505439444",
      email: "foobar@gmail.com",
      email_verified: true,
      at_hash: "YYynQxmPcrF3xGKXgJCB4g",
      locale: "en",
      iat: 1675219731,
      exp: 1675223331,
    };
    const cUser = mapUserToCompass(gUser);
    expect(cUser.name).toEqual("Mystery Person");
    expect(cUser.firstName).toEqual("Mystery");
    expect(cUser.lastName).toEqual("Person");
    expect(cUser.google?.picture).toEqual("not provided");
    expect(cUser.google?.googleId).toEqual(gUser.sub);
    expect(cUser.identities).toEqual([
      expect.objectContaining({
        provider: "google",
        subjectId: gUser.sub,
        email: gUser.email,
        picture: "not provided",
      }),
    ]);
  });
  it("throws error if missing email", () => {
    expect(() => {
      mapUserToCompass({} as TokenPayload);
    }).toThrow(BaseError);
  });

  it("does not duplicate an existing google identity", () => {
    const google = { googleId: "sub-1", picture: "pic" };
    const existing = mergeGoogleLoginIdentity(
      undefined,
      google,
      "a@example.com",
      "A",
      new Date("2026-01-01T00:00:00.000Z"),
    );

    expect(
      mergeGoogleLoginIdentity(
        existing,
        google,
        "a@example.com",
        "A",
        new Date("2026-02-01T00:00:00.000Z"),
      ),
    ).toEqual(existing);
  });

  it("appends a distinct login identity without duplicating the same subject", () => {
    const google = { googleId: "sub-1", picture: "pic" };
    const existing = mergeGoogleLoginIdentity(
      undefined,
      google,
      "a@example.com",
      "A",
      new Date("2026-01-01T00:00:00.000Z"),
    );
    const microsoft = {
      provider: "microsoft" as const,
      subjectId: "oid-1",
      email: "a@example.com",
      linkedAt: new Date("2026-03-01T00:00:00.000Z"),
    };

    expect(mergeLoginIdentities(existing, [microsoft])).toEqual([
      ...(existing ?? []),
      microsoft,
    ]);
    expect(mergeLoginIdentities(existing, [microsoft, microsoft])).toEqual([
      ...(existing ?? []),
      microsoft,
    ]);
  });
});
