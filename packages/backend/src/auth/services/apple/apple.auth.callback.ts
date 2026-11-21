import { type AuthOAuthFlow } from "@core/analytics/oauth-signup.events";
import { Status } from "@core/errors/status.codes";
import { CONFIG } from "@backend/common/constants/config.constants";

export const APPLE_SIGNIN_FORM_POST_PATH = "/api/auth/apple/callback";
export const APPLE_SIGNIN_SPA_CALLBACK_PATH = "/auth/apple/callback";

type FormPostBody = Record<string, unknown>;

const formField = (body: FormPostBody, key: string): string => {
  const value = body[key];
  return typeof value === "string" ? value : "";
};

export function encodeAppleOAuthState(
  frontendRedirectURI: string,
  options?: { posthogDistinctId?: string; flow?: AuthOAuthFlow },
): string {
  return Buffer.from(
    JSON.stringify({
      frontendRedirectURI,
      ...(options?.posthogDistinctId ? { ph: options.posthogDistinctId } : {}),
      ...(options?.flow ? { fl: options.flow } : {}),
    }),
    "utf8",
  ).toString("base64");
}

export function appleSpaCallbackUrl(
  frontendUrl: string,
  params: { code?: string; state: string; user?: string; error?: string },
): string {
  const url = new URL(APPLE_SIGNIN_SPA_CALLBACK_PATH, frontendUrl);
  url.searchParams.set("state", params.state);
  if (params.code) {
    url.searchParams.set("code", params.code);
  }
  if (params.user) {
    url.searchParams.set("user", params.user);
  }
  if (params.error) {
    url.searchParams.set("error", params.error);
  }
  return url.toString();
}

export function resolveAppleFormPostRedirect(
  body: FormPostBody,
  frontendUrl: string = CONFIG.FRONTEND_URL,
):
  | { location: string }
  | { status: typeof Status.BAD_REQUEST; message: string } {
  const state = formField(body, "state").trim();
  if (!state) {
    return {
      status: Status.BAD_REQUEST,
      message: "Sign in with Apple is missing the OAuth state",
    };
  }

  let frontendRedirectURI: string;
  try {
    const decoded = Buffer.from(state, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as { frontendRedirectURI?: unknown };
    if (typeof parsed.frontendRedirectURI !== "string") {
      throw new Error("missing frontendRedirectURI");
    }
    frontendRedirectURI = parsed.frontendRedirectURI;
  } catch {
    return {
      status: Status.BAD_REQUEST,
      message: "Sign in with Apple returned a mismatched OAuth state",
    };
  }

  let redirectUrl: URL;
  let expectedOrigin: string;
  try {
    redirectUrl = new URL(frontendRedirectURI);
    expectedOrigin = new URL(frontendUrl).origin;
  } catch {
    return {
      status: Status.BAD_REQUEST,
      message: "Sign in with Apple returned a mismatched OAuth state",
    };
  }

  if (
    redirectUrl.origin !== expectedOrigin ||
    redirectUrl.pathname !== APPLE_SIGNIN_SPA_CALLBACK_PATH
  ) {
    return {
      status: Status.BAD_REQUEST,
      message: "Sign in with Apple returned a mismatched OAuth state",
    };
  }

  return {
    location: appleSpaCallbackUrl(frontendUrl, {
      state,
      code: formField(body, "code") || undefined,
      user: formField(body, "user") || undefined,
      error: formField(body, "error") || undefined,
    }),
  };
}
