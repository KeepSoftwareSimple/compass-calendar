import { type Status } from "@core/errors/status.codes";

export type ApiAdapter = <T>(
  config: ApiRequestConfig & { body?: unknown },
) => Promise<ApiResponse<T>>;

export interface ApiError extends Error {
  config?: ApiRequestConfig;
  response?: ApiResponse<unknown>;
}

export interface ApiRequestConfig {
  body?: unknown;
  headers?: HeadersInit;
  method?: string;
  // Abort the underlying fetch (e.g. a type-ahead query cancelled on
  // unmount). Aborting rejects the request promise with an AbortError.
  signal?: AbortSignal;
  skipSessionRecovery?: boolean;
  url?: string;
}

export interface ApiResponse<T> {
  config: ApiRequestConfig;
  data: T;
  headers: Headers;
  status: number;
  statusText: string;
}

export type ApiMethodConfig = Pick<
  ApiRequestConfig,
  "headers" | "signal" | "skipSessionRecovery"
>;

export type SignoutStatus =
  | Status.UNAUTHORIZED
  | Status.NOT_FOUND
  | Status.GONE;
