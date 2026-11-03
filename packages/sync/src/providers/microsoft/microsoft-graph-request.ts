import { MICROSOFT_REQUEST_TIMEOUT_MS } from "@sync/providers/microsoft/microsoft-http.constants";
import {
  parseRetryAfterMs,
  withRetryableProviderHttp,
} from "@sync/providers/provider-http-retry.util";

export interface MicrosoftGraphRequestInit {
  readonly accessToken: string;
  readonly url: string;
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
  readonly fallbackError: string;
  /** Successful responses skip the JSON body (Graph DELETE). */
  readonly emptyOk?: boolean;
}

export async function microsoftGraphRequest<T>(
  init: MicrosoftGraphRequestInit,
): Promise<T> {
  // Retryable status detection is the shared default: Graph errors already
  // carry `response.status`. Only Retry-After needs a Graph-specific read.
  return withRetryableProviderHttp(
    () => executeMicrosoftGraphRequest<T>(init),
    {
      readRetryAfterMs: (error) =>
        parseRetryAfterMs(
          (error as { retryAfter?: string | null })?.retryAfter ?? undefined,
        ),
    },
  );
}

async function executeMicrosoftGraphRequest<T>(
  init: MicrosoftGraphRequestInit,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${init.accessToken}`,
    ...init.headers,
  };
  const hasBody = init.body !== undefined;
  if (hasBody && headers["Content-Type"] === undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(init.url, {
    method: init.method ?? "GET",
    headers,
    ...(hasBody ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(MICROSOFT_REQUEST_TIMEOUT_MS),
  });

  if (init.emptyOk) {
    if (response.ok) return undefined as T;
    throw microsoftGraphHttpError(
      response.status,
      await parseJsonOrEmpty(response),
      init.fallbackError,
      response.headers.get("Retry-After"),
    );
  }

  const data = (await response.json()) as T & {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw microsoftGraphHttpError(
      response.status,
      data,
      init.fallbackError,
      response.headers.get("Retry-After"),
    );
  }
  return data;
}

function microsoftGraphHttpError(
  status: number,
  data: unknown,
  fallbackError: string,
  retryAfter: string | null,
): Error {
  const message =
    (data as { error?: { message?: string } } | undefined)?.error?.message ??
    fallbackError;
  return Object.assign(new Error(message), {
    response: { status, data },
    retryAfter,
  });
}

async function parseJsonOrEmpty(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
