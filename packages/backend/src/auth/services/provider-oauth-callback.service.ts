import { isOAuthCallbackQueryEmpty } from "@core/analytics/oauth-signup.events";
import {
  type ProviderKind,
  ProviderKindSchema,
} from "@core/types/sync/identity.contracts";
import { providerOAuthSignupAnalytics } from "@backend/auth/services/provider-oauth-signup.analytics";
import { CONFIG } from "@backend/common/constants/config.constants";

const PROVIDER_SIGNIN_CALLBACK_PATH_PREFIX = "/auth";

const providerCallbackPath = (provider: ProviderKind) =>
  `${PROVIDER_SIGNIN_CALLBACK_PATH_PREFIX}/${provider}/callback`;

export type ProviderOAuthCallbackQuery = {
  state?: string;
  code?: string;
  error?: string;
  scope?: string;
};

export type ProviderOAuthCallbackResolution =
  | { mode: "telemetry" }
  | { mode: "redirect"; location: string };

function queryField(
  query: ProviderOAuthCallbackQuery,
  key: keyof ProviderOAuthCallbackQuery,
): string | undefined {
  const value = query[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function captureOAuthCallbackQueryAnalytics(
  provider: ProviderKind,
  query: { state?: string; code?: string; providerError?: string },
): Promise<void> {
  await providerOAuthSignupAnalytics.captureCallbackQuery({
    provider,
    state: query.state,
    code: query.code,
    providerError: query.providerError ?? null,
  });
}

function frontendRootUrl(frontendUrl: string = CONFIG.FRONTEND_URL): string {
  return new URL("/", frontendUrl).toString();
}

function spaCallbackUrl(
  provider: ProviderKind,
  query: ProviderOAuthCallbackQuery,
  frontendUrl: string = CONFIG.FRONTEND_URL,
): string {
  const url = new URL(providerCallbackPath(provider), frontendUrl);
  for (const key of ["state", "code", "error", "scope"] as const) {
    const value = queryField(query, key);
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export function parseProviderOAuthCallbackProvider(
  providerParam: string,
): ProviderKind | null {
  const parsed = ProviderKindSchema.safeParse(providerParam);
  return parsed.success ? parsed.data : null;
}

export async function handleProviderOAuthCallback(input: {
  provider: ProviderKind;
  query: ProviderOAuthCallbackQuery;
  telemetryOnly: boolean;
  frontendUrl?: string;
}): Promise<ProviderOAuthCallbackResolution> {
  const state = queryField(input.query, "state");
  const code = queryField(input.query, "code");
  const providerError = queryField(input.query, "error");

  const emptyQuery = isOAuthCallbackQueryEmpty({
    state,
    code,
    providerError,
  });

  if (emptyQuery) {
    if (input.telemetryOnly) {
      return { mode: "telemetry" };
    }
    return {
      mode: "redirect",
      location: frontendRootUrl(input.frontendUrl),
    };
  }

  await captureOAuthCallbackQueryAnalytics(input.provider, {
    state,
    code,
    providerError,
  });

  if (input.telemetryOnly) {
    return { mode: "telemetry" };
  }

  return {
    mode: "redirect",
    location: spaCallbackUrl(input.provider, input.query, input.frontendUrl),
  };
}

export async function appleFormPostAnalytics(input: {
  state: string;
  code?: string;
  error?: string;
}): Promise<void> {
  await captureOAuthCallbackQueryAnalytics("apple", {
    state: input.state,
    code: input.code,
    providerError: input.error,
  });
}
