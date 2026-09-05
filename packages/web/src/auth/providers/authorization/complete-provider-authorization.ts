import {
  type GoogleConnectErrorResponse,
  GoogleConnectErrorResponseSchema,
} from "@core/types/auth.types";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { type ApiError } from "@web/api/api.types";
import { DEFAULT_CALENDAR_ROUTE } from "@web/common/constants/routes";
import {
  GOOGLE_AUTHORIZATION_ERROR_MESSAGE,
  MISSING_GOOGLE_SCOPES_ERROR_MESSAGE,
  MISSING_PROVIDER_SCOPES_ERROR_MESSAGE,
  PROVIDER_AUTH_SCOPES_REQUIRED,
  PROVIDER_AUTHORIZATION_ERROR_MESSAGE,
} from "./provider-authorization.constants";
import {
  clearProviderAuthorizationIntent,
  markGoogleAuthNeedsConsentRetry,
  readProviderAuthorizationIntent,
} from "./provider-authorization.storage";
import {
  buildProviderAuthCallbackUrl,
  buildProviderAuthCodePayload,
  type ProviderAuthCodeRequest,
} from "./provider-authorization.util";

type CompleteAuthentication = (input: {
  email?: string;
  onComplete?: () => void;
}) => Promise<void>;

export type ProviderAuthorizationAuthAdapter = {
  loginOrSignup(data: ProviderAuthCodeRequest): Promise<{
    createdNewRecipeUser: boolean;
    user: { emails?: string[] };
  }>;
};

export type CompleteProviderAuthorizationOptions = {
  provider: ProviderKind;
  authApi: ProviderAuthorizationAuthAdapter;
  completeAuthentication: CompleteAuthentication;
  search: string;
};

export type CompleteProviderAuthorizationResult =
  | {
      returnPath: string;
      status: "completed";
      isNewUser: boolean;
    }
  | {
      message: string;
      returnPath: string;
      status: "failed";
    };

const AUTHORIZATION_ERROR_MESSAGE: Record<ProviderKind, string> = {
  google: GOOGLE_AUTHORIZATION_ERROR_MESSAGE,
  microsoft: PROVIDER_AUTHORIZATION_ERROR_MESSAGE,
  apple: PROVIDER_AUTHORIZATION_ERROR_MESSAGE,
};

const MISSING_SCOPES_ERROR_MESSAGE: Record<ProviderKind, string> = {
  google: MISSING_GOOGLE_SCOPES_ERROR_MESSAGE,
  microsoft: MISSING_PROVIDER_SCOPES_ERROR_MESSAGE,
  apple: MISSING_PROVIDER_SCOPES_ERROR_MESSAGE,
};

const CONSENT_RETRY_ERROR_CODES_BY_PROVIDER: Partial<
  Record<ProviderKind, ReadonlySet<string>>
> = {
  google: new Set(["GOOGLE_REFRESH_TOKEN_MISSING"]),
};

const fail = (
  provider: ProviderKind,
  returnPath: string = DEFAULT_CALENDAR_ROUTE,
  message = AUTHORIZATION_ERROR_MESSAGE[provider],
): CompleteProviderAuthorizationResult => ({
  message,
  returnPath,
  status: "failed",
});

const getApiError = (error: unknown): ApiError | undefined => {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return undefined;
  }

  return error as ApiError;
};

const parseGoogleConnectError = (
  error: unknown,
): GoogleConnectErrorResponse | undefined => {
  const data = getApiError(error)?.response?.data;
  const parsed = GoogleConnectErrorResponseSchema.safeParse(data);

  return parsed.success ? parsed.data : undefined;
};

export async function completeProviderAuthorization({
  provider,
  authApi,
  completeAuthentication,
  search,
}: CompleteProviderAuthorizationOptions): Promise<CompleteProviderAuthorizationResult> {
  const params = new URLSearchParams(search);
  const state = params.get("state");

  if (!state) {
    return fail(provider);
  }

  const savedIntent = readProviderAuthorizationIntent(provider, state);
  clearProviderAuthorizationIntent(provider, state);
  const returnPath = savedIntent?.returnPath ?? DEFAULT_CALENDAR_ROUTE;

  if (!savedIntent || params.get("error")) {
    return fail(provider, returnPath);
  }

  const code = params.get("code");

  if (!code) {
    return fail(provider, returnPath);
  }

  const requiredScopes = PROVIDER_AUTH_SCOPES_REQUIRED[provider];
  const grantedScopes = new Set((params.get("scope") ?? "").split(" "));
  const isMissingRequiredScope = requiredScopes.some(
    (scope) => !grantedScopes.has(scope),
  );

  if (isMissingRequiredScope) {
    return fail(provider, returnPath, MISSING_SCOPES_ERROR_MESSAGE[provider]);
  }

  const payload = buildProviderAuthCodePayload({
    provider,
    code,
    scope: params.get("scope") ?? undefined,
    state,
    redirectUri: buildProviderAuthCallbackUrl(provider),
  });

  try {
    const result = await authApi.loginOrSignup(payload);
    await completeAuthentication({
      email: result.user.emails?.[0],
    });

    return {
      returnPath,
      status: "completed",
      isNewUser: result.createdNewRecipeUser,
    };
  } catch (error) {
    const parsedError = parseGoogleConnectError(error);
    const consentRetryCodes = CONSENT_RETRY_ERROR_CODES_BY_PROVIDER[provider];

    if (parsedError?.code && consentRetryCodes?.has(parsedError.code)) {
      markGoogleAuthNeedsConsentRetry();
    }

    if (parsedError?.message) {
      return fail(provider, returnPath, parsedError.message);
    }

    return fail(provider, returnPath);
  }
}
