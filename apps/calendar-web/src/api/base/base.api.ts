import {
  type ApiAdapter,
  type ApiMethodConfig,
  type ApiRequestConfig,
  type ApiResponse,
} from "../api.types";
import {
  createApiError,
  getRequestUrl,
  getResponseData,
  handleErrorResponse,
  isAbortError,
  isApiError,
} from "../util/api.util";

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
};

const request = async <T>(
  method: string,
  url: string,
  body?: unknown,
  config: ApiMethodConfig = {},
): Promise<ApiResponse<T>> => {
  const requestConfig = {
    body,
    headers: config.headers,
    method,
    signal: config.signal,
    skipSessionRecovery: config.skipSessionRecovery,
    url,
  } satisfies ApiRequestConfig;

  try {
    if (BaseApi.defaults.adapter) {
      const result = await BaseApi.defaults.adapter<T>({
        ...requestConfig,
        body,
      });
      return result;
    }

    const response = await fetch(getRequestUrl(url), {
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "include",
      headers: {
        ...DEFAULT_HEADERS,
        ...config.headers,
      },
      method,
      signal: config.signal,
    });
    const data = await getResponseData(response);
    const result = {
      config: requestConfig,
      data: data as T,
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    } satisfies ApiResponse<T>;

    if (!response.ok) {
      throw createApiError(requestConfig, result as ApiResponse<unknown>);
    }

    return result;
  } catch (error) {
    // Cancellation is cancellation: wrapping AbortError as ApiError made
    // obsolete range reads look like backend failures (retry, session
    // recovery, error toast). The request config already documents AbortError.
    if (isAbortError(error)) {
      throw error;
    }
    if (isApiError(error)) {
      return handleErrorResponse(error, {
        onGoogleRevoked: BaseApi.defaults.onGoogleRevoked,
      });
    }

    throw createApiError(requestConfig);
  }
};

export const BaseApi = {
  defaults: {
    adapter: undefined as ApiAdapter | undefined,
    onGoogleRevoked: undefined as
      | ((context?: { calendarId?: string | null }) => void)
      | undefined,
    withCredentials: true,
  },
  delete<T>(url: string, config?: ApiMethodConfig) {
    return request<T>("DELETE", url, undefined, config);
  },
  get<T>(url: string, config?: ApiMethodConfig) {
    return request<T>("GET", url, undefined, config);
  },
  post<T>(url: string, body?: unknown, config?: ApiMethodConfig) {
    return request<T>("POST", url, body, config);
  },
  put<T>(url: string, body?: unknown, config?: ApiMethodConfig) {
    return request<T>("PUT", url, body, config);
  },
  patch<T>(url: string, body?: unknown, config?: ApiMethodConfig) {
    return request<T>("PATCH", url, body, config);
  },
};
