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
import { getCloudMutationMode } from "@backend/common/services/sync-service/cloud-mutation-mode";

class ConfigController {
  get = (_req: Request<never, AppConfig, never, never>, res: Response) => {
    const google = isGoogleConfigured(CONFIG);
    const microsoft =
      isMicrosoftConfigured(CONFIG) && isMicrosoftOffered(CONFIG.NODE_ENV);
    const appleSignIn = isAppleSignInConfigured(CONFIG);
    const appleConnect = isAppleConnectConfigured(CONFIG);
    const stripe = isStripeConfigured(CONFIG);

    res.json(
      AppConfigSchema.parse({
        version: normalizeDeployVersion(CONFIG.VERSION),
        google: {
          isConfigured: google,
        },
        providers: {
          google: { signIn: google, connect: google },
          microsoft: { signIn: microsoft, connect: microsoft },
          apple: { signIn: appleSignIn, connect: appleConnect },
        },
        sync: {
          cloudMutationMode: getCloudMutationMode(),
          execution: CONFIG.SYNC_EXECUTION,
        },
        billing: {
          isConfigured: stripe,
          enforcement: isBillingEnforced(CONFIG),
          trialLengthDays: BILLING_PLAN.TRIAL_LENGTH_DAYS,
          publishableKey: stripe
            ? (CONFIG.STRIPE_PUBLISHABLE_KEY ?? null)
            : null,
        },
      }),
    );
  };
}

export default new ConfigController();
