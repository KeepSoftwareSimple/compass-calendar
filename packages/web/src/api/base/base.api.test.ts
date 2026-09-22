import { BaseApi } from "./base.api";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

describe("BaseApi", () => {
  beforeEach(() => {
    BaseApi.defaults.adapter = undefined;
    BaseApi.defaults.onGoogleRevoked = undefined;
  });

  afterEach(() => {
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
