import { z } from "zod";
import {
  type CompassConfig,
  loadCompassConfig,
} from "@core/config/compass.config";
import { NodeEnv, PORT_DEFAULT_BACKEND } from "@core/constants/core.constants";
import { Logger } from "@core/logger/winston.logger";
import { isDev, isNonProduction } from "@core/util/env.util";
import {
  isGoogleClientIdValid,
  isGoogleClientSecretValid,
} from "./config.util";

const logger = Logger("app:constants");

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

// Accept a yaml boolean or the strings "true"/"false" (env vars are strings).
// Mirrors packages/sync/src/config/sync.config.ts's BooleanFromInput.
const BooleanFromInput = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true");

const ConfigSchema = z
  .object({
    BASEURL: z.string().nonempty(),
    GOOGLE_CLIENT_ID: z.string().nonempty().optional(),
    GOOGLE_CLIENT_SECRET: z.string().nonempty().optional(),
    MICROSOFT_CLIENT_ID: z.string().nonempty().optional(),
    MICROSOFT_CLIENT_SECRET: z.string().nonempty().optional(),
    APPLE_SIGNIN_SERVICES_ID: z.string().nonempty().optional(),
    APPLE_SIGNIN_TEAM_ID: z.string().nonempty().optional(),
    APPLE_SIGNIN_KEY_ID: z.string().nonempty().optional(),
    APPLE_SIGNIN_PRIVATE_KEY: z.string().nonempty().optional(),
    SYNC_CREDENTIAL_ENCRYPTION_KEY: z.string().nonempty().optional(),
    DB: z.string().nonempty(),
    FRONTEND_URL: z.string().url(),
    MONGO_URI: z.string().nonempty(),
    NODE_ENV: z.nativeEnum(NodeEnv),
    VERSION: z.string().nonempty().optional(),
    TZ: z.enum(["Etc/UTC", "UTC"]),
    ORIGINS_ALLOWED: z.array(z.string().nonempty()).default([]),
    PORT: z.string().nonempty().default(PORT_DEFAULT_BACKEND.toString()),
    SUPERTOKENS_URI: z.string().nonempty(),
    SUPERTOKENS_KEY: z.string().nonempty(),
    TOKEN_COMPASS_SYNC: z.string().nonempty(),
    // Base URL + shared secret for the Sync service's internal API. Required:
    // every deployment delegates provider-connection and event routes to
    // Sync — the legacy in-backend engine that used to be the fallback for
    // an unconfigured Sync client no longer exists.
    SYNC_SERVICE_URL: z.string().url(),
    SYNC_INTERNAL_AUTH_TOKEN: z.string().nonempty(),
    // Whether cloud event writes and provider-connection changes are accepted.
    // `maintenance` rejects them with a typed MAINTENANCE response (S50).
    SYNC_CLOUD_MUTATION_MODE: z
      .enum(["enabled", "maintenance"])
      .default("enabled"),
    // Mirror of sync.execution for the backend startup guard + operator
    // surface. Sync itself enforces passive/active.
    SYNC_EXECUTION: z.enum(["passive", "active"]).default("passive"),
    POSTHOG_KEY: z.string().nonempty().optional(),
    POSTHOG_HOST: z.string().url().optional(),
    STRIPE_SECRET_KEY: z.string().nonempty().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().nonempty().optional(),
    STRIPE_PRICE_ID: z.string().nonempty().optional(),
    STRIPE_PUBLISHABLE_KEY: z.string().nonempty().optional(),
    // Operator pause switch: when false, trial/billing gates stay off for
    // everyone regardless of Stripe configuration.
    BILLING_ENFORCEMENT: BooleanFromInput.default(false),
    // Accounts exempt from billing gates while enforcement is on. Operator
    // config only -- never user-supplied. Empty by default.
    BILLING_BYPASS_EMAILS: z.array(z.string()).default([]),
    EMAIL_PROVIDER: z.enum(["resend", "log"]).optional(),
    EMAIL_API_KEY: z.string().nonempty().optional(),
    EMAIL_FROM: z.string().nonempty().optional(),
    EMAIL_WEBHOOK_SECRET: z.string().nonempty().optional(),
    EMAIL_UNSUBSCRIBE_SECRET: z.string().nonempty().optional(),
    EMAIL_SCHEDULE_PROFILE: z.enum(["real", "fast"]).optional(),
    EMAIL_ALLOWLIST: z.array(z.string()).default([]),
  })
  .strict()
  .superRefine((env, context) => {
    const hasGoogleClientId = isGoogleClientIdValid(env.GOOGLE_CLIENT_ID);
    const hasGoogleClientSecret = isGoogleClientSecretValid(
      env.GOOGLE_CLIENT_SECRET,
    );

    if (hasGoogleClientId !== hasGoogleClientSecret) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        fatal: true,
        message: "Google configuration requires both client ID and secret",
        path: hasGoogleClientId
          ? ["GOOGLE_CLIENT_SECRET"]
          : ["GOOGLE_CLIENT_ID"],
      });
    }

    const hasMicrosoftClientId = Boolean(env.MICROSOFT_CLIENT_ID);
    const hasMicrosoftClientSecret = Boolean(env.MICROSOFT_CLIENT_SECRET);
    if (hasMicrosoftClientId !== hasMicrosoftClientSecret) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        fatal: true,
        message: "Microsoft configuration requires both client ID and secret",
        path: hasMicrosoftClientId
          ? ["MICROSOFT_CLIENT_SECRET"]
          : ["MICROSOFT_CLIENT_ID"],
      });
    }

    const appleSignInKeys = [
      env.APPLE_SIGNIN_SERVICES_ID,
      env.APPLE_SIGNIN_TEAM_ID,
      env.APPLE_SIGNIN_KEY_ID,
      env.APPLE_SIGNIN_PRIVATE_KEY,
    ];
    const applePresent = appleSignInKeys.filter(Boolean).length;
    if (applePresent > 0 && applePresent < 4) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        fatal: true,
        message:
          "Apple sign-in configuration requires servicesId, teamId, keyId, and privateKey together",
        path: ["APPLE_SIGNIN_SERVICES_ID"],
      });
    }

    const stripeKeys = [
      env.STRIPE_SECRET_KEY,
      env.STRIPE_WEBHOOK_SECRET,
      env.STRIPE_PRICE_ID,
      env.STRIPE_PUBLISHABLE_KEY,
    ];
    const present = stripeKeys.filter(Boolean).length;
    if (present > 0 && present < 4) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        fatal: true,
        message:
          "Stripe configuration requires secretKey, webhookSecret, priceId, and publishableKey together",
        path: ["STRIPE_SECRET_KEY"],
      });
    }

    if (env.EMAIL_PROVIDER === "resend") {
      const resendRequired: Array<
        [
          (
            | "EMAIL_API_KEY"
            | "EMAIL_FROM"
            | "EMAIL_WEBHOOK_SECRET"
            | "EMAIL_UNSUBSCRIBE_SECRET"
          ),
          string | undefined,
        ]
      > = [
        ["EMAIL_API_KEY", env.EMAIL_API_KEY],
        ["EMAIL_FROM", env.EMAIL_FROM],
        ["EMAIL_WEBHOOK_SECRET", env.EMAIL_WEBHOOK_SECRET],
        ["EMAIL_UNSUBSCRIBE_SECRET", env.EMAIL_UNSUBSCRIBE_SECRET],
      ];
      for (const [path, value] of resendRequired) {
        if (!value) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            fatal: true,
            message: `${path} is required when EMAIL_PROVIDER is resend`,
            path: [path],
          });
        }
      }
    }

    if (
      env.EMAIL_SCHEDULE_PROFILE === "fast" &&
      !isNonProduction(env.NODE_ENV)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        fatal: true,
        message:
          "EMAIL_SCHEDULE_PROFILE fast is not allowed when NODE_ENV is production",
        path: ["EMAIL_SCHEDULE_PROFILE"],
      });
    }
  });

export type Config = z.infer<typeof ConfigSchema>;

const toStr = (
  value: string | number | null | undefined,
): string | undefined => (value != null ? String(value) : undefined);

const nonEmpty = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

// Blank entries (a trailing comma in a deploy var, a stray "" in yaml) can
// never match an email, but they would inflate the roster count the backend
// logs at startup -- the operator's only confirmation that a redeploy picked
// up a change. Drop them at the boundary.
const toEmailList = (values: string[] | undefined): string[] =>
  (values ?? []).filter((value) => value.trim() !== "");

export function parseRawConfig(config: CompassConfig): Config {
  const nodeEnv = config.runtime.nodeEnv as NodeEnv;

  return ConfigSchema.parse({
    BASEURL: config.backend.apiUrl,
    GOOGLE_CLIENT_ID: nonEmpty(config.google?.clientId),
    GOOGLE_CLIENT_SECRET: nonEmpty(config.google?.clientSecret),
    MICROSOFT_CLIENT_ID: nonEmpty(config.microsoft?.clientId),
    MICROSOFT_CLIENT_SECRET: nonEmpty(config.microsoft?.clientSecret),
    APPLE_SIGNIN_SERVICES_ID: nonEmpty(config.apple?.signIn?.servicesId),
    APPLE_SIGNIN_TEAM_ID: nonEmpty(config.apple?.signIn?.teamId),
    APPLE_SIGNIN_KEY_ID: nonEmpty(config.apple?.signIn?.keyId),
    APPLE_SIGNIN_PRIVATE_KEY: nonEmpty(config.apple?.signIn?.privateKey),
    SYNC_CREDENTIAL_ENCRYPTION_KEY: nonEmpty(
      config.sync?.credentialEncryptionKey,
    ),
    DB: isDev(nodeEnv) ? "dev_calendar" : "prod_calendar",
    FRONTEND_URL: config.web.url,
    MONGO_URI: config.mongo.uri,
    NODE_ENV: nodeEnv,
    VERSION: toStr(config.runtime.version),
    TZ: config.runtime.timezone,
    ORIGINS_ALLOWED: config.backend.originsAllowed ?? [],
    PORT: toStr(config.backend.port),
    SUPERTOKENS_URI: config.supertokens.uri,
    SUPERTOKENS_KEY: config.supertokens.key,
    TOKEN_COMPASS_SYNC: config.backend.compassToken,
    SYNC_SERVICE_URL: nonEmpty(config.sync?.serviceUrl),
    SYNC_INTERNAL_AUTH_TOKEN: nonEmpty(config.sync?.internalAuthToken),
    SYNC_CLOUD_MUTATION_MODE: config.sync?.cloudMutationMode,
    SYNC_EXECUTION: config.sync?.execution,
    POSTHOG_KEY: nonEmpty(config.posthog?.key),
    POSTHOG_HOST: nonEmpty(config.posthog?.host) || DEFAULT_POSTHOG_HOST,
    STRIPE_SECRET_KEY: nonEmpty(config.stripe?.secretKey),
    STRIPE_WEBHOOK_SECRET: nonEmpty(config.stripe?.webhookSecret),
    STRIPE_PRICE_ID: nonEmpty(config.stripe?.priceId),
    STRIPE_PUBLISHABLE_KEY: nonEmpty(config.stripe?.publishableKey),
    BILLING_ENFORCEMENT: config.billing?.enforcement,
    BILLING_BYPASS_EMAILS: toEmailList(config.billing?.bypassEmails),
    EMAIL_PROVIDER: config.email?.provider,
    EMAIL_API_KEY: nonEmpty(config.email?.apiKey),
    EMAIL_FROM: nonEmpty(config.email?.from),
    EMAIL_WEBHOOK_SECRET: nonEmpty(config.email?.webhookSecret),
    EMAIL_UNSUBSCRIBE_SECRET: nonEmpty(config.email?.unsubscribeSecret),
    EMAIL_SCHEDULE_PROFILE: config.email?.scheduleProfile,
    EMAIL_ALLOWLIST: toEmailList(config.email?.allowlist),
  });
}

export function parseConfigFromEnv(
  rawEnv: Record<string, string | undefined>,
): Config {
  const nodeEnv = rawEnv["NODE_ENV"] as NodeEnv;

  return ConfigSchema.parse({
    BASEURL: rawEnv["BASEURL"],
    GOOGLE_CLIENT_ID: rawEnv["GOOGLE_CLIENT_ID"],
    GOOGLE_CLIENT_SECRET: rawEnv["GOOGLE_CLIENT_SECRET"],
    MICROSOFT_CLIENT_ID: rawEnv["MICROSOFT_CLIENT_ID"],
    MICROSOFT_CLIENT_SECRET: rawEnv["MICROSOFT_CLIENT_SECRET"],
    APPLE_SIGNIN_SERVICES_ID: rawEnv["APPLE_SIGNIN_SERVICES_ID"],
    APPLE_SIGNIN_TEAM_ID: rawEnv["APPLE_SIGNIN_TEAM_ID"],
    APPLE_SIGNIN_KEY_ID: rawEnv["APPLE_SIGNIN_KEY_ID"],
    APPLE_SIGNIN_PRIVATE_KEY: rawEnv["APPLE_SIGNIN_PRIVATE_KEY"],
    SYNC_CREDENTIAL_ENCRYPTION_KEY: rawEnv["SYNC_CREDENTIAL_ENCRYPTION_KEY"],
    DB: isDev(nodeEnv) ? "dev_calendar" : "prod_calendar",
    FRONTEND_URL: rawEnv["FRONTEND_URL"],
    MONGO_URI: rawEnv["MONGO_URI"],
    NODE_ENV: nodeEnv,
    VERSION: nonEmpty(rawEnv["VERSION"]),
    TZ: rawEnv["TZ"],
    ORIGINS_ALLOWED: rawEnv["CORS"]
      ? rawEnv["CORS"]
          .split(",")
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0)
      : [],
    PORT: rawEnv["PORT"],
    SUPERTOKENS_URI: rawEnv["SUPERTOKENS_URI"],
    SUPERTOKENS_KEY: rawEnv["SUPERTOKENS_KEY"],
    TOKEN_COMPASS_SYNC: rawEnv["TOKEN_COMPASS_SYNC"],
    // nonEmpty so a var set to "" reads as unset, and fails the schema's
    // required check with a clear "missing" message rather than a confusing
    // url()/nonempty() validation error.
    SYNC_SERVICE_URL: nonEmpty(rawEnv["SYNC_SERVICE_URL"]),
    SYNC_INTERNAL_AUTH_TOKEN: nonEmpty(rawEnv["SYNC_INTERNAL_AUTH_TOKEN"]),
    SYNC_CLOUD_MUTATION_MODE: nonEmpty(rawEnv["SYNC_CLOUD_MUTATION_MODE"]),
    SYNC_EXECUTION: nonEmpty(rawEnv["SYNC_EXECUTION"]),
    POSTHOG_KEY: rawEnv["POSTHOG_KEY"],
    POSTHOG_HOST: rawEnv["POSTHOG_HOST"] || DEFAULT_POSTHOG_HOST,
    STRIPE_SECRET_KEY: nonEmpty(rawEnv["STRIPE_SECRET_KEY"]),
    STRIPE_WEBHOOK_SECRET: nonEmpty(rawEnv["STRIPE_WEBHOOK_SECRET"]),
    STRIPE_PRICE_ID: nonEmpty(rawEnv["STRIPE_PRICE_ID"]),
    STRIPE_PUBLISHABLE_KEY: nonEmpty(rawEnv["STRIPE_PUBLISHABLE_KEY"]),
    BILLING_ENFORCEMENT: nonEmpty(rawEnv["BILLING_ENFORCEMENT"]),
    BILLING_BYPASS_EMAILS: toEmailList(
      rawEnv["BILLING_BYPASS_EMAILS"]?.split(","),
    ),
    EMAIL_PROVIDER: nonEmpty(rawEnv["EMAIL_PROVIDER"]) as
      | "resend"
      | "log"
      | undefined,
    EMAIL_API_KEY: nonEmpty(rawEnv["EMAIL_API_KEY"]),
    EMAIL_FROM: nonEmpty(rawEnv["EMAIL_FROM"]),
    EMAIL_WEBHOOK_SECRET: nonEmpty(rawEnv["EMAIL_WEBHOOK_SECRET"]),
    EMAIL_UNSUBSCRIBE_SECRET: nonEmpty(rawEnv["EMAIL_UNSUBSCRIBE_SECRET"]),
    EMAIL_SCHEDULE_PROFILE: nonEmpty(rawEnv["EMAIL_SCHEDULE_PROFILE"]) as
      | "real"
      | "fast"
      | undefined,
    EMAIL_ALLOWLIST: toEmailList(rawEnv["EMAIL_ALLOWLIST"]?.split(",")),
  });
}

const isTestWithoutConfig =
  process.env["NODE_ENV"] === "test" && !process.env["COMPASS_CONFIG_FILE"];

let parsedConfig: Config;

try {
  if (isTestWithoutConfig) {
    parsedConfig = parseConfigFromEnv(process.env);
  } else {
    const rawConfig = loadCompassConfig();
    // Honor runtime.logLevel from the config file. Winston and the request
    // logger read LOG_LEVEL from the environment, so surface it there.
    if (rawConfig.runtime.logLevel) {
      process.env["LOG_LEVEL"] = rawConfig.runtime.logLevel;
    }
    parsedConfig = parseRawConfig(rawConfig);
  }
} catch (error) {
  logger.error(
    "Exiting because a critical config value is missing or invalid:",
  );
  console.error(error);
  process.exit(1);
}

export const CONFIG = parsedConfig;
export const IS_DEV = isDev(CONFIG.NODE_ENV);

logger.info(
  `Sync: execution=${CONFIG.SYNC_EXECUTION} cloudMutationMode=${CONFIG.SYNC_CLOUD_MUTATION_MODE}`,
);
