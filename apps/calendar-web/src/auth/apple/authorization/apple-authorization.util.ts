import { type GoogleAuthCodeRequest } from "@core/types/auth.types";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { APPLE_SIGNIN_FORM_POST_PATH } from "./apple-authorization.constants";

export function buildAppleSignInRedirectUri(
  backendOrigin = ENV_WEB.BACKEND_BASEURL,
) {
  return `${backendOrigin}${APPLE_SIGNIN_FORM_POST_PATH}`;
}

export function buildAppleAuthCodePayload({
  code,
  state,
  user,
  redirectUri = buildAppleSignInRedirectUri(),
}: {
  code: string;
  state?: string;
  user?: string;
  redirectUri?: string;
}): GoogleAuthCodeRequest {
  return {
    thirdPartyId: "apple",
    clientType: "web",
    redirectURIInfo: {
      redirectURIOnProviderDashboard: redirectUri,
      redirectURIQueryParams: {
        code,
        ...(state ? { state } : {}),
        ...(user ? { user } : {}),
      },
    },
  };
}
