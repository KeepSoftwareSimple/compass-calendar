import { type ZodType } from "zod/v4";
import { Status } from "@core/errors/status.codes";
import {
  type GoogleConnectErrorResponse,
  GoogleConnectErrorResponseSchema,
} from "@core/types/auth.types";
import { session } from "@web/auth/compass/session/Session";
import { hasUserEverAuthenticated } from "@web/auth/compass/state/auth.state.util";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { DEFAULT_CALENDAR_ROUTE } from "@web/common/constants/routes";
import {
  showErrorToast,
  showSessionExpiredToast,
} from "@web/common/utils/toast/error-toast.util";
import {
  type ApiError,
  type ApiRequestConfig,
  type ApiResponse,
  type SignoutStatus,
} from "../api.types";

export const createApiError = (
  config: ApiRequestConfig,
  response?: ApiResponse<unknown>,
): ApiError => {
  // Keep status as the last three characters when present so `handleError` can
  // still fall back to `error.message.slice(-3)` without a response object.
  const method = config.method?.toUpperCase();
  const target = [method, config.url].filter(Boolean).join(" ");
  const targetSuffix = target ? ` for ${target}` : "";
  const statusSuffix = response ? ` with status ${response.status}` : "";
  const error = new Error(
    `Request failed${targetSuffix}${statusSuffix}`,
  ) as ApiError;
  error.config = config;
  error.name = "ApiError";
  error.response = response;
  return error;
};

const getApiErrorData = (error: ApiError): unknown => {
  return error?.response?.data;
};

export const isApiError = (error: unknown): error is ApiError => {
  return (
    typeof error === "object" &&
    error !== null &&
    ("config" in error || "response" in error)
  );
};

/**
 * Prefer the structured status on ApiError; fall back to the trailing status
 * digits in the message for errors that only carry text (same convention as
 * {@link createApiError}).
 */
export const getErrorStatus = (error: unknown): number | undefined => {
  if (isApiError(error) && typeof error.response?.status === "number") {
    return error.response.status;
  }
  if (error instanceof Error) {
    const parsed = parseInt(error.message.slice(-3), 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
};

/**
 * GONE/UNAUTHORIZED are session-level failures — the API interceptor signs the
 * user out and shows SessionExpiredToast, so callers must not add a second
 * recovery UI (load-error overlays, mutation toasts, etc.).
 */
export const isSessionLevelError = (error: unknown): boolean => {
  const status = getErrorStatus(error);
  return status === Status.UNAUTHORIZED || status === Status.GONE;
};

/** True when a fetch failed for a reason that still needs a local Retry UI. */
export const shouldShowContextualLoadError = (
  isError: boolean,
  error: unknown,
): boolean => isError && !isSessionLevelError(error);

/**
 * Extracts the error code from an API error's response data.
 * Returns undefined when the response has no object body with a string `code` property.
 */
export const getApiErrorCode = (error: ApiError): string | undefined => {
  const data = getApiErrorData(error);
  if (!data || typeof data !== "object" || !("code" in data)) return undefined;
  const code = (data as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
};

/** Safe user-facing string from a JSON API body, if present. */
export const getApiErrorMessage = (error: unknown): string | undefined => {
  if (!isApiError(error)) return undefined;
  const data = getApiErrorData(error);
  if (!data || typeof data !== "object") return undefined;
  const record = data as { error?: unknown; message?: unknown };
  for (const value of [record.error, record.message]) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
};

export const parseApiError = <T>(
  error: ApiError,
  schema: ZodType<T>,
): T | undefined => {
  const parsed = schema.safeParse(getApiErrorData(error));
  return parsed.success ? parsed.data : undefined;
};

export const parseGoogleConnectError = (
  error: ApiError,
): GoogleConnectErrorResponse | undefined => {
  return parseApiError(error, GoogleConnectErrorResponseSchema);
};

export const signOut = async (status: SignoutStatus) => {
  // since there are currently duplicate event fetches,
  // this prevents triggering a separate alert for each fetch
  // this can be removed once we have logic to cancel subsequent requests
  // after one failed
  if (status === Status.UNAUTHORIZED) {
    showSessionExpiredToast();
  } else {
    showErrorToast("Login required, cuz security");
  }

  await session.signOut();

  if (window.location.pathname.startsWith(DEFAULT_CALENDAR_ROUTE)) {
    return;
  }
  // Navigate in-app rather than assigning window.location: a document
  // navigation tears down the toast we just raised, so the one message telling
  // the user they were signed out was destroyed on every route that needed it.
  // Imported dynamically for the same module-cycle reason SessionExpiredToast
  // documents (this file sits on the API error path the router pulls back in).
  const { router } = await import("@web/routers");
  await router.navigate({ to: DEFAULT_CALENDAR_ROUTE });
};

export const getRequestUrl = (url: string): string => {
  if (/^https?:\/\//.test(url)) {
    return url;
  }

  return `${ENV_WEB.API_BASEURL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
};

export const getResponseData = async (response: Response): Promise<unknown> => {
  if (response.status === 204) {
    return undefined;
  }

  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

interface ApiErrorResponseDependencies {
  onGoogleRevoked?: (context?: { calendarId?: string | null }) => void;
}

const getRequestCalendarId = (body: unknown): string | null | undefined => {
  if (!body || typeof body !== "object") return undefined;
  if (!("calendarId" in body)) return undefined;
  const calendarId = (body as { calendarId?: unknown }).calendarId;
  return typeof calendarId === "string" || calendarId === null
    ? calendarId
    : undefined;
};

export const handleErrorResponse = async (
  error: ApiError,
  { onGoogleRevoked }: ApiErrorResponseDependencies,
): Promise<never> => {
  const requestUrl = error.config?.url;
  const status = error.response?.status;

  const isUserProfileNotFound =
    status === Status.NOT_FOUND && requestUrl?.includes("/user/profile");
  if (isUserProfileNotFound) {
    throw error;
  }

  if (
    // Prefer 410 Gone (backend). Keep accepting 401 for older deployments;
    // SuperTokens may already have exhausted session refresh on those.
    (status === Status.GONE || status === Status.UNAUTHORIZED) &&
    // "GOOGLE_REVOKED" here is the HTTP error envelope code the backend sends
    // on this response (independent of the syncStatusChanged SSE code of the
    // same name, B10).
    getApiErrorCode(error) === "GOOGLE_REVOKED"
  ) {
    if (!onGoogleRevoked) {
      throw new Error("Calendar revocation handler is not configured");
    }

    onGoogleRevoked({
      calendarId: getRequestCalendarId(error.config?.body),
    });
    throw error;
  }

  if (error.config?.skipSessionRecovery && status === Status.UNAUTHORIZED) {
    throw error;
  }

  const isAuthEndpoint =
    requestUrl?.includes("/signinup") ||
    requestUrl?.includes("/session/refresh") ||
    requestUrl?.includes("/signout");

  // A 404 on a data endpoint means a resource is missing (e.g. syncing a
  // just-created event onto a calendar the server hasn't provisioned yet),
  // not that the session is invalid - so it must never force a sign-out.
  // Only genuine session-level failures (GONE/UNAUTHORIZED) do, and only
  // for browsers that have actually signed in before. A first-time visitor
  // can still receive 401s (SuperTokens refresh on the first API call,
  // a protected route hit without a session) — that is "not signed in",
  // not "you have been signed out".
  if (
    !isAuthEndpoint &&
    (status === Status.GONE || status === Status.UNAUTHORIZED)
  ) {
    if (hasUserEverAuthenticated()) {
      await signOut(status);
    }
  } else if (!isAuthEndpoint) {
    console.error(error);
  }

  throw error;
};
