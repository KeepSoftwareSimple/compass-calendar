import { createApiError } from "@web/api/util/api.util";
import {
  readAuthenticated,
  resetAuthSessionStoreForTests,
  setAuthSessionAuthenticated,
} from "@web/auth/compass/session/auth-session.store";
import { session } from "@web/auth/compass/session/Session";
import {
  clearAuthenticationState,
  markUserAsAuthenticated,
} from "@web/auth/compass/state/auth.state.util";
import { BaseApi } from "./base.api";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

describe("BaseApi", () => {
  beforeEach(() => {
    BaseApi.defaults.adapter = undefined;
    BaseApi.defaults.onGoogleRevoked = undefined;
  });

  afterEach(() => {
    resetAuthSessionStoreForTests();
    clearAuthenticationState();
    BaseApi.defaults.adapter = undefined;
    BaseApi.defaults.onGoogleRevoked = undefined;
  });

  it("forwards the configured Google revocation handler", async () => {
    const onGoogleRevoked = mock();
    BaseApi.defaults.onGoogleRevoked = onGoogleRevoked;
    BaseApi.defaults.adapter = async (config) => {
      throw Object.assign(new Error("Request failed"), {
        config,
        response: {
          config,
          data: { code: "CONNECTION_REVOKED" },
          headers: new Headers(),
          status: 410,
          statusText: "Gone",
        },
      });
    };

    await expect(BaseApi.get("/event")).rejects.toMatchObject({
      message: "Request failed",
    });

    expect(onGoogleRevoked).toHaveBeenCalledTimes(1);
  });

  it("preserves a new session when an earlier guest request returns 401", async () => {
    setAuthSessionAuthenticated(false);
    const signOut = spyOn(session, "signOut").mockResolvedValue(undefined);
    BaseApi.defaults.adapter = async (config) => {
      setAuthSessionAuthenticated(true);
      markUserAsAuthenticated("host@example.com");
      throw createApiError(config, {
        config,
        data: {},
        headers: new Headers(),
        status: 401,
        statusText: "Unauthorized",
      });
    };

    try {
      await expect(BaseApi.get("/user/metadata")).rejects.toMatchObject({
        response: { status: 401 },
      });
      expect(readAuthenticated()).toBe(true);
      expect(signOut).not.toHaveBeenCalled();
    } finally {
      signOut.mockRestore();
    }
  });

  it("rethrows AbortError instead of wrapping it as ApiError", async () => {
    BaseApi.defaults.adapter = async () => {
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      throw error;
    };

    await expect(BaseApi.get("/event")).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
