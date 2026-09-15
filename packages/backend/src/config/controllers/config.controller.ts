import { type Request, type Response } from "express";
import { BILLING_PLAN } from "@core/constants/billing.constants";
import { type AppConfig, AppConfigSchema } from "@core/types/config.types";
import { normalizeDeployVersion } from "@core/util/deploy-version.util";
import { isMicrosoftOffered } from "@core/util/env.util";
import { CONFIG } from "@backend/common/constants/config.constants";
import {
  isAppleConnectConfigured,
  isAppleSignInConfigured,
  isBillingEnforced,
  isGoogleConfigured,
  isMicrosoftConfigured,
  isStripeConfigured,
} from "@backend/common/constants/config.util";

export const buildAppConfig = (config: typeof CONFIG): AppConfig => {
  const google = isGoogleConfigured(config);
  const microsoft =
    isMicrosoftConfigured(config) && isMicrosoftOffered(config.NODE_ENV);
  const appleSignIn = isAppleSignInConfigured(config);
  const appleConnect = isAppleConnectConfigured(config);
  const stripe = isStripeConfigured(config);

  return AppConfigSchema.parse({
    version: normalizeDeployVersion(config.VERSION),
    google: {
      isConfigured: google,
    },
    providers: {
      google: { signIn: google, connect: google },
      microsoft: { signIn: microsoft, connect: microsoft },
      apple: { signIn: appleSignIn, connect: appleConnect },
    },
    sync: {
      cloudMutationMode: config.SYNC_CLOUD_MUTATION_MODE,
      execution: config.SYNC_EXECUTION,
    },
    billing: {
      isConfigured: stripe,
      enforcement: isBillingEnforced(config),
      trialLengthDays: BILLING_PLAN.TRIAL_LENGTH_DAYS,
      publishableKey: stripe ? (config.STRIPE_PUBLISHABLE_KEY ?? null) : null,
    },
  });
};

// CONFIG is process-lifetime. Parse once at import so GET /api/config does
// not rebuild and re-validate the same object on every request.
const APP_CONFIG = buildAppConfig(CONFIG);

class ConfigController {
  get = (_req: Request<never, AppConfig, never, never>, res: Response) => {
    res.json(APP_CONFIG);
  };
}

export default new ConfigController();
