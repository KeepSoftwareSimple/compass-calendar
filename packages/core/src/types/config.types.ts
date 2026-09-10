import { z } from "zod";
import { BILLING_PLAN } from "@core/constants/billing.constants";

const ProviderFlagsSchema = z.object({
  signIn: z.boolean(),
  connect: z.boolean(),
});

const defaultProviderFlags = { signIn: false, connect: false };

export const AppConfigSchema = z
  .object({
    /** Deployed release tag or build SHA (matches PostHog `version`). */
    version: z.string().min(1),
    google: z.object({
      isConfigured: z.boolean(),
    }),
    /**
     * Per-provider sign-in and calendar-connect availability. Omitted on
     * older `/api/config` payloads; derived from `google.isConfigured` so the
     * web's existing reader still works for one release.
     */
    providers: z
      .object({
        google: ProviderFlagsSchema,
        microsoft: ProviderFlagsSchema,
        apple: ProviderFlagsSchema,
      })
      .optional(),
    /**
     * Operator-visible Sync cutover posture (S50). Global deployment knobs —
     * never per-user. Defaults match safe pre-cutover values when omitted.
     */
    sync: z
      .object({
        cloudMutationMode: z
          .enum(["enabled", "maintenance"])
          .default("enabled"),
        execution: z.enum(["passive", "active"]).default("passive"),
      })
      .default({
        cloudMutationMode: "enabled",
        execution: "passive",
      }),
    /**
     * Hosted billing. `isConfigured: false` is the self-host escape hatch:
     * the web must not render a paid gate, and the backend must not enforce
     * read-only. `enforcement: false` is the operator pause switch: trial and
     * billing gates stay off for everyone regardless of `isConfigured`, until
     * the operator is ready to turn the product on. Defaults keep old
     * `/api/config` payloads parseable and default to paused.
     */
    billing: z
      .object({
        isConfigured: z.boolean(),
        enforcement: z.boolean().default(false),
        trialLengthDays: z.number(),
        // Public Stripe.js key. Default null so old /api/config payloads still
        // parse until every backend is on the four-value stripe block.
        publishableKey: z.string().nullable().default(null),
      })
      .default({
        isConfigured: false,
        enforcement: false,
        trialLengthDays: BILLING_PLAN.TRIAL_LENGTH_DAYS,
        publishableKey: null,
      }),
  })
  .transform((config) => ({
    ...config,
    providers: config.providers ?? {
      google: {
        signIn: config.google.isConfigured,
        connect: config.google.isConfigured,
      },
      microsoft: defaultProviderFlags,
      apple: defaultProviderFlags,
    },
  }));

export type AppConfig = z.infer<typeof AppConfigSchema>;
