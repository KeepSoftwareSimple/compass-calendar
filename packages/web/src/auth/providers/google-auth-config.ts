import { ENV_WEB } from "@web/common/constants/env.constants";

export const isGoogleAuthConfigured = (clientId?: string): boolean =>
  Boolean(clientId && clientId !== "undefined");

export const IS_GOOGLE_AUTH_CONFIGURED = isGoogleAuthConfigured(
  ENV_WEB.GOOGLE_CLIENT_ID,
);
