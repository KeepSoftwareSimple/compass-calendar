import { parse } from "yaml";
import { z } from "zod";
import { type NodeEnv } from "@core/constants/core.constants";
import { isNonProduction } from "@core/util/env.util";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const optionalString = z.string().nullish();

const isPresent = (value: string | null | undefined): boolean =>
  Boolean(value && value.trim() !== "");

const presentCount = (...values: Array<string | null | undefined>): number =>
  values.filter(isPresent).length;

const isBase64Key32 = (value: string): boolean => {
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
};

const CompassConfigSchema = z
  .object({
    web: z.object({
      port: z.union([z.string(), z.number()]).optional(),
      url: z.string(),
    }),
    backend: z.object({
      port: z.union([z.string(), z.number()]).optional(),
      apiUrl: z.string(),
      originsAllowed: z.array(z.string()).optional(),
      compassToken: z.string(),
    }),
    runtime: z.object({
      version: z.union([z.string(), z.number()]).optional(),
      nodeEnv: z.string(),
      logLevel: z.string().optional(),
      timezone: z.enum(["Etc/UTC", "UTC"]),
    }),
    mongo: z.object({
      username: z.string().optional(),
      password: z.string().optional(),
      replicaSetKey: z.string().optional(),
      uri: z.string(),
    }),
    supertokens: z.object({
      uri: z.string(),
      key: z.string(),
      postgres: z
        .object({
          user: z.string().optional(),
          password: z.string().optional(),
          database: z.string().optional(),
        })
        .nullish(),
    }),
    google: z
      .object({
        clientId: optionalString,
        clientSecret: optionalString,
      })
      .nullish(),
    microsoft: z
      .object({
        clientId: optionalString,
        clientSecret: optionalString,
      })
      .nullish(),
    apple: z
      .object({
        signIn: z
          .object({
            servicesId: optionalString,
            teamId: optionalString,
            keyId: optionalString,
            privateKey: optionalString,
          })
          .nullish(),
      })
      .nullish(),
    // Welcome-sequence email delivery. Omit the whole block to keep email off
    // (no enrollment, poller, or send routes). Self-host defaults to off.
    email: z
      .object({
        provider: z.enum(["resend", "log"]),
        apiKey: optionalString,
        from: optionalString,
        webhookSecret: optionalString,
        unsubscribeSecret: optionalString,
        scheduleProfile: z.enum(["real", "fast"]).optional(),
        allowlist: z.array(z.string()).optional(),
      })
      .nullish(),
    posthog: z
      .object({
        key: optionalString,
        host: optionalString,
      })
      .nullish(),
    // Hosted Stripe billing. All-four-or-none is enforced when this is
    // mapped into backend CONFIG (see config.constants superRefine). Omit
    // the whole block for self-host — billing enforcement then stays off.
    stripe: z
      .object({
        secretKey: optionalString,
        webhookSecret: optionalString,
        priceId: optionalString,
        publishableKey: optionalString,
      })
      .nullish(),
    // Operator pause switch for trial/billing gates, independent of whether
    // Stripe is configured. Omit or set false to keep the app free for
    // everyone while `stripe:` stays populated for in-progress work.
    // Accepts a yaml boolean or a "true"/"false" string (env-sourced deploy
    // values arrive as strings) — normalized downstream in backend
    // config.constants.ts, mirroring sync.enforceLeastPrivilege below.
    billing: z
      .object({
        enforcement: z.union([z.boolean(), z.string()]).optional(),
        // Operator escape hatch: accounts listed here are treated as fully
        // subscribed even while enforcement is on. Intended for staging test
        // accounts that cannot complete a real Stripe Checkout. Matched
        // case-insensitively against the user's email.
        bypassEmails: z.array(z.string()).optional(),
      })
      .nullish(),
    // Compass Sync service configuration. Every deployment runs Sync (self-host
    // included) and delegates provider-connection and event routes to it — there
    // is no more legacy-vs-sync choice to make. The block itself stays optional
    // at this layer (not required-and-non-nullish) because this same schema
    // parses Sync's own compass.yaml section for non-backend consumers
    // (packages/scripts commands); the backend enforces serviceUrl/
    // internalAuthToken as hard-required itself and exits at startup without
    // them. Sync owns its OWN isolated Mongo database (mongoUri) and never
    // reads the backend's mongo.uri, per the sync-service ownership boundary.
    sync: z
      .object({
        port: z.union([z.string(), z.number()]).optional(),
        mongoUri: z.string(),
        internalAuthToken: z.string(),
        // The base URL the backend uses to reach the Sync service (e.g.
        // http://localhost:3010 in dev, an internal service URL in prod).
        // Required in practice (the backend exits at startup without it);
        // kept optional in the schema for the non-backend consumers above.
        serviceUrl: z.string().optional(),
        // Whether cloud event writes and provider-connection changes are
        // accepted (`enabled`) or rejected with a typed MAINTENANCE response
        // (`maintenance`). Independent of routing/execution so cutover can
        // pause mutations while Sync stays passive or active.
        cloudMutationMode: z.enum(["enabled", "maintenance"]).optional(),
        callbackBaseUrl: z.string(),
        // Where the OAuth callback redirects the browser after connecting;
        // defaults to callbackBaseUrl when omitted.
        postConnectRedirectUrl: z.string().optional(),
        execution: z.enum(["passive", "active"]).optional(),
        maxConcurrency: z.union([z.string(), z.number()]).optional(),
        // How many of maxConcurrency's drains are reserved away from
        // initialImport/repair, so a wave of long-running imports can never
        // head-of-line block webhook/reconcile pulls behind them.
        reservedPullLanes: z.union([z.string(), z.number()]).optional(),
        enforceLeastPrivilege: z.union([z.boolean(), z.string()]).optional(),
        // The Compass API's database name, used by the least-privilege check.
        compassApiDatabase: z.string().optional(),
        // 32-byte base64 key for password credentials at rest (Apple). Required
        // when Apple calendar connect is enabled; omit to leave connect off.
        credentialEncryptionKey: optionalString,
      })
      .nullish(),
  })
  .strict()
  .superRefine((config, context) => {
    const microsoftCount = presentCount(
      config.microsoft?.clientId,
      config.microsoft?.clientSecret,
    );
    if (microsoftCount === 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Microsoft configuration requires both client ID and secret",
        path: isPresent(config.microsoft?.clientId)
          ? ["microsoft", "clientSecret"]
          : ["microsoft", "clientId"],
      });
    }

    const appleSignIn = config.apple?.signIn;
    const appleCount = presentCount(
      appleSignIn?.servicesId,
      appleSignIn?.teamId,
      appleSignIn?.keyId,
      appleSignIn?.privateKey,
    );
    if (appleCount > 0 && appleCount < 4) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Apple sign-in configuration requires servicesId, teamId, keyId, and privateKey together",
        path: ["apple", "signIn"],
      });
    }

    const credentialKey = config.sync?.credentialEncryptionKey?.trim();
    if (credentialKey && !isBase64Key32(credentialKey)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "sync.credentialEncryptionKey must be 32 bytes of base64",
        path: ["sync", "credentialEncryptionKey"],
      });
    }

    const email = config.email;
    if (email?.provider === "resend") {
      const resendRequired: Array<[string, string | null | undefined]> = [
        ["apiKey", email.apiKey],
        ["from", email.from],
        ["webhookSecret", email.webhookSecret],
        ["unsubscribeSecret", email.unsubscribeSecret],
      ];
      for (const [field, value] of resendRequired) {
        if (!isPresent(value)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `email.${field} is required when email.provider is resend`,
            path: ["email", field],
          });
        }
      }
    }

    if (
      email?.scheduleProfile === "fast" &&
      !isNonProduction(config.runtime.nodeEnv as NodeEnv)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "email.scheduleProfile fast is not allowed when runtime.nodeEnv is production",
        path: ["email", "scheduleProfile"],
      });
    }
  });

export type CompassConfig = z.infer<typeof CompassConfigSchema>;

const PLACEHOLDER_PREFIX = "REPLACE_WITH_";

function collectPlaceholderPaths(
  value: unknown,
  path: string,
  results: string[],
): void {
  if (typeof value === "string") {
    if (value.includes(PLACEHOLDER_PREFIX)) results.push(path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) =>
      collectPlaceholderPaths(item, `${path}[${i}]`, results),
    );
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      collectPlaceholderPaths(child, path ? `${path}.${key}` : key, results);
    }
  }
}

export function parseCompassConfigText(
  text: string,
  filePath: string,
): CompassConfig {
  let rawConfig: unknown;
  try {
    rawConfig = parse(text);
  } catch (error) {
    throw new Error(
      `Could not parse Compass config file ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const parsed = CompassConfigSchema.safeParse(rawConfig);

  if (!parsed.success) {
    throw new Error(
      `Invalid Compass config file ${filePath}: ${parsed.error.message}`,
    );
  }

  const placeholderPaths: string[] = [];
  collectPlaceholderPaths(parsed.data, "", placeholderPaths);
  if (placeholderPaths.length > 0) {
    throw new Error(
      `Compass config file ${filePath} contains unfilled placeholder values.\n` +
        `Replace the following fields with real values:\n` +
        placeholderPaths.map((p) => `  - ${p}`).join("\n"),
    );
  }

  return parsed.data;
}

function findCompassConfigFile(
  explicitPath = process.env["COMPASS_CONFIG_FILE"],
): string {
  if (explicitPath) {
    return resolve(explicitPath);
  }

  // Walk up from CWD so scripts run from a subdirectory (e.g. packages/web)
  // still find compass.yaml at the repo root.
  let dir = process.cwd();
  for (;;) {
    const candidate = resolve(dir, "compass.yaml");
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }

  if (existsSync("/app/compass.yaml")) return "/app/compass.yaml";

  throw new Error(
    "Missing Compass config file. Create compass.yaml from compass.example.yaml.",
  );
}

function loadCompassConfigFile(filePath = findCompassConfigFile()) {
  return parseCompassConfigText(readFileSync(filePath, "utf8"), filePath);
}

export function loadCompassConfig(filePath?: string): CompassConfig {
  return loadCompassConfigFile(filePath);
}
