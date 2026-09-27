import { AppConfigApi } from "@web/api/app-config.api";
import { IS_GOOGLE_AUTH_CONFIGURED } from "@web/auth/google/google-auth-config";
import { createProviderAvailability } from "@web/auth/providers/provider-availability.factory";

export const providerAvailability = createProviderAvailability({
  getConfig: AppConfigApi.get,
  isGoogleAuthConfigured: IS_GOOGLE_AUTH_CONFIGURED,
});
