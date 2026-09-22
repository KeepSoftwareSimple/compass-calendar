import { ENV_WEB } from "@web/common/constants/env.constants";

type ApiError = Error & {
  response?: { status?: number };
};

const getRequestUrl = (url: string): string => {
  if (/^https?:\/\//.test(url)) {
    return url;
  }
  return `${ENV_WEB.API_BASEURL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
};

const createApiError = (
  method: string,
  url: string,
  status?: number,
): ApiError => {
  const target = [method.toUpperCase(), url].filter(Boolean).join(" ");
  const statusSuffix = status ? ` with status ${status}` : "";
  const error = new Error(
    `Request failed for ${target}${statusSuffix}`,
  ) as ApiError;
  error.name = "ApiError";
  if (status !== undefined) {
    error.response = { status };
  }
  return error;
};

export const getErrorStatus = (error: unknown): number | undefined => {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as ApiError).response?.status === "number"
  ) {
    return (error as ApiError).response?.status;
  }
  if (error instanceof Error) {
    const parsed = Number.parseInt(error.message.slice(-3), 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
};

async function request<T>(
  method: string,
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(getRequestUrl(url), {
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    method,
    signal,
  });

  const text = await response.text();
  const data = text.length > 0 ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw createApiError(method, url, response.status);
  }

  return data as T;
}

export const publicBookingHttp = {
  get<T>(url: string, signal?: AbortSignal) {
    return request<T>("GET", url, undefined, signal);
  },
  patch<T>(url: string, body: unknown) {
    return request<T>("PATCH", url, body);
  },
  post<T>(url: string, body?: unknown) {
    return request<T>("POST", url, body);
  },
};
