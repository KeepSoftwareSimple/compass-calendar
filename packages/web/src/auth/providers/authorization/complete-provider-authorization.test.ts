import { GOOGLE_SCOPES } from "@core/providers/google.scopes";
import { MICROSOFT_SCOPES } from "@core/providers/microsoft.scopes";
import { completeProviderAuthorization } from "./complete-provider-authorization";
import { PROVIDER_AUTH_SCOPES_REQUIRED } from "./provider-authorization.constants";
import {
  consumeGoogleAuthNeedsConsentRetry,
  readProviderAuthorizationIntent,
  writeProviderAuthorizationIntent,
} from "./provider-authorization.storage";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const makeDeps = () => ({
  authApi: {
    loginOrSignup: mock(async () => ({
      createdNewRecipeUser: false,
      status: "OK" as const,
      user: { emails: ["user@example.com"] },
    })),
  },
  completeAuthentication: mock(async () => undefined),
});

const callbackSearch = (state: string, scope: string) =>
  `?state=${encodeURIComponent(
    state,
  )}&code=auth-code&scope=${encodeURIComponent(scope)}`;

describe("completeProviderAuthorization", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("completes a saved Google sign-in intent", async () => {
    const deps = makeDeps();
    writeProviderAuthorizationIntent("google", "state-1", {
      intent: "signIn",
      returnPath: "/week",
      createdAt: Date.now(),
    });

    await expect(
      completeProviderAuthorization({
        provider: "google",
        ...deps,
        search: callbackSearch("state-1", GOOGLE_SCOPES.join(" ")),
      }),
    ).resolves.toEqual({
      status: "completed",
      returnPath: "/week",
      isNewUser: false,
    });

    expect(deps.authApi.loginOrSignup).toHaveBeenCalledWith(
      expect.objectContaining({
        thirdPartyId: "google",
        redirectURIInfo: expect.objectContaining({
          redirectURIQueryParams: expect.objectContaining({
            code: "auth-code",
            state: "state-1",
          }),
        }),
      }),
    );
    expect(readProviderAuthorizationIntent("google", "state-1")).toBeNull();
  });

  it("completes a saved Microsoft sign-in intent", async () => {
    const deps = makeDeps();
    writeProviderAuthorizationIntent("microsoft", "ms-state", {
      intent: "signIn",
      returnPath: "/week",
      createdAt: Date.now(),
    });

    await expect(
      completeProviderAuthorization({
        provider: "microsoft",
        ...deps,
        search: callbackSearch("ms-state", MICROSOFT_SCOPES.join(" ")),
      }),
    ).resolves.toEqual({
      status: "completed",
      returnPath: "/week",
      isNewUser: false,
    });

    expect(deps.authApi.loginOrSignup).toHaveBeenCalledWith(
      expect.objectContaining({
        thirdPartyId: "active-directory",
      }),
    );
  });

  it("reads required scopes from core constants", () => {
    expect(PROVIDER_AUTH_SCOPES_REQUIRED.google).toEqual([...GOOGLE_SCOPES]);
    expect(PROVIDER_AUTH_SCOPES_REQUIRED.microsoft).toEqual([
      ...MICROSOFT_SCOPES,
    ]);
  });

  it("marks the next Google attempt for a forced consent retry", async () => {
    const deps = makeDeps();
    deps.authApi.loginOrSignup = mock(async () => {
      throw Object.assign(new Error("Conflict"), {
        response: {
          data: {
            code: "GOOGLE_REFRESH_TOKEN_MISSING",
            message:
              "Google did not grant a fresh authorization. Please try again.",
          },
        },
      });
    });
    writeProviderAuthorizationIntent("google", "state-4", {
      intent: "signIn",
      returnPath: "/week",
      createdAt: Date.now(),
    });

    expect(consumeGoogleAuthNeedsConsentRetry()).toBe(false);

    await expect(
      completeProviderAuthorization({
        provider: "google",
        ...deps,
        search: callbackSearch("state-4", GOOGLE_SCOPES.join(" ")),
      }),
    ).resolves.toEqual({
      status: "failed",
      message: "Google did not grant a fresh authorization. Please try again.",
      returnPath: "/week",
    });

    expect(consumeGoogleAuthNeedsConsentRetry()).toBe(true);
  });
});
