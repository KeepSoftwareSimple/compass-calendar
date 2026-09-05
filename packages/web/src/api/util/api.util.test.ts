import { Status } from "@core/errors/status.codes";
import {
  ApiErrorResponseSchema,
  GoogleConnectErrorResponseSchema,
} from "@core/types/auth.types";
import { session } from "@web/auth/compass/session/Session";
import { markUserAsAuthenticated } from "@web/auth/compass/state/auth.state.util";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import {
  type ApiError,
  type ApiRequestConfig,
  type ApiResponse,
} from "../api.types";
import {
  createApiError as buildApiError,
  getApiErrorCode,
  getApiErrorMessage,
  getErrorStatus,
  handleErrorResponse,
  isSessionLevelError,
  parseApiError,
  parseGoogleConnectError,
  shouldShowContextualLoadError,
} from "./api.util";
import { describe, expect, it, mock, spyOn } from "bun:test";

const createApiError = (
  response: { data?: unknown; status?: number } | null,
  config: ApiRequestConfig = {},
): ApiError =>
  Object.assign(new Error("Request failed"), {
    config,
    response: response
      ? ({
          config,
          data: response.data,
          headers: new Headers(),
          status: response.status ?? 400,
          statusText: "Error",
        } as ApiResponse<unknown>)
      : undefined,
  });

describe("createApiError", () => {
  it("includes method, url, and trailing status for failed responses", () => {
    const config = { method: "get", url: "/event?kind=timed" };
    const response = {
      config,
      data: {},
      headers: new Headers(),
      status: 500,
      statusText: "Internal Server Error",
    } satisfies ApiResponse<unknown>;

    const error = buildApiError(config, response);

    expect(error.name).toBe("ApiError");
    expect(error.message).toBe(
      "Request failed for GET /event?kind=timed with status 500",
    );
    expect(error.message.slice(-3)).toBe("500");
    expect(error.config).toBe(config);
    expect(error.response).toBe(response);
  });

  it("includes method and url when there is no response", () => {
    const config = { method: "DELETE", url: "/event/abc" };
    const error = buildApiError(config);

    expect(error.message).toBe("Request failed for DELETE /event/abc");
    expect(error.response).toBeUndefined();
  });
});

describe("getErrorStatus", () => {
  it("reads the structured ApiError response status", () => {
    const error = createApiError({ status: Status.UNAUTHORIZED });
    expect(getErrorStatus(error)).toBe(Status.UNAUTHORIZED);
  });

  it("falls back to trailing message digits when there is no response", () => {
    const error = new Error("Request failed with status 500");
    expect(getErrorStatus(error)).toBe(500);
  });

  it("returns undefined for unrelated values", () => {
    expect(getErrorStatus(undefined)).toBeUndefined();
    expect(getErrorStatus("nope")).toBeUndefined();
    expect(getErrorStatus(new Error("no status here"))).toBeUndefined();
  });
});

describe("isSessionLevelError", () => {
  it.each([
    Status.UNAUTHORIZED,
    Status.GONE,
  ])("is true for session status %s", (status) => {
    expect(isSessionLevelError(createApiError({ status }))).toBe(true);
  });

  it("is false for other HTTP failures", () => {
    expect(
      isSessionLevelError(createApiError({ status: Status.INTERNAL_SERVER })),
    ).toBe(false);
    expect(
      isSessionLevelError(createApiError({ status: Status.NOT_FOUND })),
    ).toBe(false);
  });
});

describe("shouldShowContextualLoadError", () => {
  it("shows local Retry UI for ordinary load failures", () => {
    expect(
      shouldShowContextualLoadError(
        true,
        createApiError({ status: Status.INTERNAL_SERVER }),
      ),
    ).toBe(true);
  });

  it("hides local Retry UI when session recovery already owns the toast", () => {
    expect(
      shouldShowContextualLoadError(
        true,
        createApiError({ status: Status.UNAUTHORIZED }),
      ),
    ).toBe(false);
    expect(
      shouldShowContextualLoadError(
        true,
        createApiError({ status: Status.GONE }),
      ),
    ).toBe(false);
  });

  it("is false when the query is not in error", () => {
    expect(
      shouldShowContextualLoadError(
        false,
        createApiError({ status: Status.UNAUTHORIZED }),
      ),
    ).toBe(false);
  });
});

describe("getApiErrorMessage", () => {
  it("returns the error string from a JSON body", () => {
    const error = createApiError({
      data: { error: "Couldn't start billing. Please try again in a moment." },
    });
    expect(getApiErrorMessage(error)).toBe(
      "Couldn't start billing. Please try again in a moment.",
    );
  });

  it("returns undefined when the body has no error string", () => {
    expect(
      getApiErrorMessage(createApiError({ data: { code: "X" } })),
    ).toBeUndefined();
    expect(getApiErrorMessage(new Error("nope"))).toBeUndefined();
  });

  it("returns the message string from a { code, message } envelope", () => {
    const error = createApiError({
      data: {
        code: "BLOCKING_CALENDAR_INVALID",
        message: "Calendar is not readable",
      },
    });
    expect(getApiErrorMessage(error)).toBe("Calendar is not readable");
  });

  it("prefers data.error over data.message when both exist", () => {
    const error = createApiError({
      data: { error: "Billing copy", message: "Ignored envelope" },
    });
    expect(getApiErrorMessage(error)).toBe("Billing copy");
  });
});

describe("getApiErrorCode", () => {
  it("returns the code when response.data has a string code property", () => {
    const error = createApiError({ data: { code: "GOOGLE_REVOKED" } });
    expect(getApiErrorCode(error)).toBe("GOOGLE_REVOKED");
  });

  it("returns the code for arbitrary error codes", () => {
    const error = createApiError({ data: { code: "FULL_SYNC_REQUIRED" } });
    expect(getApiErrorCode(error)).toBe("FULL_SYNC_REQUIRED");
  });

  it("returns undefined when error has no response", () => {
    const error = createApiError(null);
    expect(getApiErrorCode(error)).toBeUndefined();
  });

  it("returns undefined when response has no data", () => {
    const error = createApiError({ data: undefined });
    expect(getApiErrorCode(error)).toBeUndefined();
  });

  it("returns undefined when data is not an object", () => {
    const error = createApiError({ data: "string body" });
    expect(getApiErrorCode(error)).toBeUndefined();
  });

  it("returns undefined when data is an array", () => {
    const error = createApiError({ data: [] });
    expect(getApiErrorCode(error)).toBeUndefined();
  });

  it("returns undefined when data has no code property", () => {
    const error = createApiError({
      data: { message: "Something went wrong" },
    });
    expect(getApiErrorCode(error)).toBeUndefined();
  });

  it("returns undefined when code is not a string", () => {
    const error = createApiError({ data: { code: 404 } });
    expect(getApiErrorCode(error)).toBeUndefined();
  });

  it("returns undefined when code is null", () => {
    const error = createApiError({ data: { code: null } });
    expect(getApiErrorCode(error)).toBeUndefined();
  });

  it("preserves message when data has both code and message", () => {
    const error = createApiError({
      data: { code: "GOOGLE_REVOKED", message: "Google access revoked." },
    });
    expect(getApiErrorCode(error)).toBe("GOOGLE_REVOKED");
  });
});

describe("parseApiError", () => {
  it("parses errors against a provided schema", () => {
    const error = createApiError({
      data: {
        code: "ANY_ERROR",
        message: "Something went wrong",
      },
    });

    expect(parseApiError(error, ApiErrorResponseSchema)).toEqual({
      code: "ANY_ERROR",
      message: "Something went wrong",
    });
  });

  it("returns undefined when the payload does not match the schema", () => {
    const error = createApiError({
      data: { code: 404, message: "Something went wrong" },
    });

    expect(parseApiError(error, ApiErrorResponseSchema)).toBeUndefined();
  });
});

describe("parseGoogleConnectError", () => {
  it("parses typed Google connect errors", () => {
    const error = createApiError({
      data: {
        code: "GOOGLE_ACCOUNT_ALREADY_CONNECTED",
        message: "Google account is already connected",
      },
    });

    expect(parseGoogleConnectError(error)).toEqual({
      code: "GOOGLE_ACCOUNT_ALREADY_CONNECTED",
      message: "Google account is already connected",
    });
  });

  it("parses Google not configured connect errors", () => {
    const error = createApiError({
      data: {
        code: "GOOGLE_NOT_CONFIGURED",
        message: "Google is not configured for this Compass instance",
      },
    });

    expect(parseGoogleConnectError(error)).toEqual({
      code: "GOOGLE_NOT_CONFIGURED",
      message: "Google is not configured for this Compass instance",
    });
  });

  it("returns undefined for non-Google-connect error codes", () => {
    const error = createApiError({
      data: {
        code: "ANY_ERROR",
        message: "Something went wrong",
      },
    });

    expect(parseGoogleConnectError(error)).toBeUndefined();
    expect(
      parseApiError(error, GoogleConnectErrorResponseSchema),
    ).toBeUndefined();
  });
});

describe("handleErrorResponse", () => {
  it.each([
    Status.UNAUTHORIZED,
    Status.GONE,
  ])("delegates Google revocation for status %s and rethrows the API error", async (status) => {
    const onGoogleRevoked = mock();
    const error = createApiError(
      {
        data: { code: "GOOGLE_REVOKED" },
        status,
      },
      { body: { calendarId: "cal-123" } },
    );

    await expect(handleErrorResponse(error, { onGoogleRevoked })).rejects.toBe(
      error,
    );

    expect(onGoogleRevoked).toHaveBeenCalledWith({ calendarId: "cal-123" });
  });

  it("does not delegate unrelated API errors", async () => {
    const onGoogleRevoked = mock();
    const error = createApiError(
      { data: { code: "SOMETHING_ELSE" }, status: Status.GONE },
      { url: "/signinup" },
    );

    await expect(handleErrorResponse(error, { onGoogleRevoked })).rejects.toBe(
      error,
    );

    expect(onGoogleRevoked).not.toHaveBeenCalled();
  });

  it("fails clearly when the calendar revocation handler is not configured", async () => {
    const error = createApiError({
      data: { code: "GOOGLE_REVOKED" },
      status: Status.UNAUTHORIZED,
    });

    await expect(
      handleErrorResponse(error, { onGoogleRevoked: undefined }),
    ).rejects.toThrow("Calendar revocation handler is not configured");
  });

  it("does not sign the user out on a 404 from a data endpoint", async () => {
    window.history.pushState({}, "", "/day");
    const signOutSpy = spyOn(session, "signOut").mockResolvedValue(undefined);
    const error = createApiError(
      { status: Status.NOT_FOUND },
      { url: "/event" },
    );

    // A missing resource (e.g. syncing an event onto a not-yet-provisioned
    // calendar) rethrows for the caller to handle - it must not eject the user.
    await expect(
      handleErrorResponse(error, { onGoogleRevoked: undefined }),
    ).rejects.toBe(error);

    expect(signOutSpy).not.toHaveBeenCalled();
    signOutSpy.mockRestore();
  });

  it("does not treat a 401 as sign-out for a first-time visitor", async () => {
    window.history.pushState({}, "", "/week");
    window.localStorage.removeItem(STORAGE_KEYS.AUTH);
    const signOutSpy = spyOn(session, "signOut").mockResolvedValue(undefined);
    const error = createApiError(
      { status: Status.UNAUTHORIZED },
      { url: "/event" },
    );

    await expect(
      handleErrorResponse(error, { onGoogleRevoked: undefined }),
    ).rejects.toBe(error);

    expect(signOutSpy).not.toHaveBeenCalled();
    signOutSpy.mockRestore();
  });

  it("still signs the user out on an unauthorized data-endpoint response", async () => {
    // Already on the calendar route, so signOut skips the (jsdom-unsupported)
    // navigation and we can assert purely on the sign-out call.
    window.history.pushState({}, "", "/week");
    markUserAsAuthenticated("person@example.com");
    const signOutSpy = spyOn(session, "signOut").mockResolvedValue(undefined);
    const error = createApiError(
      { status: Status.UNAUTHORIZED },
      { url: "/event" },
    );

    await expect(
      handleErrorResponse(error, { onGoogleRevoked: undefined }),
    ).rejects.toBe(error);

    expect(signOutSpy).toHaveBeenCalledTimes(1);
    signOutSpy.mockRestore();
  });

  it("leaves a non-calendar route through the router, not a document navigation", async () => {
    // A document navigation tears down the toast signOut just raised, so on
    // every route that actually needed it the "you've been signed out" message
    // was destroyed before it could be read. Routing in-app keeps it alive.
    window.history.pushState({}, "", "/day/2026-07-31");
    markUserAsAuthenticated("person@example.com");
    const navigate = mock((_options: { to: string }) => Promise.resolve());
    mock.module("@web/routers", () => ({ router: { navigate } }));
    const signOutSpy = spyOn(session, "signOut").mockResolvedValue(undefined);
    const error = createApiError(
      { status: Status.UNAUTHORIZED },
      { url: "/event" },
    );

    await expect(
      handleErrorResponse(error, { onGoogleRevoked: undefined }),
    ).rejects.toBe(error);

    expect(signOutSpy).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith({ to: "/week" });
    signOutSpy.mockRestore();
    window.history.pushState({}, "", "/week");
  });
});
