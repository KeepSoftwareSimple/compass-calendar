import { ROOT_ROUTES } from "@web/common/constants/routes";

export const APPLE_AUTH_CALLBACK_PATH = ROOT_ROUTES.APPLE_AUTH_CALLBACK;
/** Backend form_post Return URL registered with the Apple Services ID. */
export const APPLE_SIGNIN_FORM_POST_PATH = "/api/auth/apple/callback";
export const APPLE_AUTH_INTENT_STORAGE_PREFIX =
  "compass.appleAuthorizationIntent";
export const APPLE_AUTH_INTENT_MAX_AGE_MS = 10 * 60 * 1000;
export const APPLE_AUTHORIZATION_ERROR_MESSAGE =
  "We couldn't sign you in with Apple. Please try again.";
