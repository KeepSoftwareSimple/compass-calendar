import { z } from "zod/v4";
import {
  type CompassConfig,
  loadCompassConfig,
} from "@core/config/compass.config";
import { NodeEnv } from "@core/constants/core.constants";
import { type ProviderKind } from "@core/types/sync/identity.contracts";

// Validated configuration for the Compass Sync service.
// Execution defaults to `passive`: the service starts, serves health, and
// verifies storage read-only, but must not claim jobs, complete OAuth, accept
// callbacks, or write to providers. Passive is enforced in code by later
// commits; here it is the safe default when the field is omitted.

const SYNC_PORT_DEFAULT = 3010;
const SYNC_MAX_CONCURRENCY_DEFAULT = 4;
const SYNC_RESERVED_PULL_LANES_DEFAULT = 1;
export const RECONCILE_STALE_AFTER_MS_DEFAULT = 15 * 60_000;
export const RECONCILE_STALE_AFTER_MS_APPLE_DEFAULT = 60_000;
const RECONCILE_SWEEP_INTERVAL_MS_DEFAULT = 10 * 60_000;
export const RECONCILE_SWEEP_INTERVAL_MS_APPLE_DEFAULT = 30_000;
export const RECONCILE_SWEEP_LIMIT_DEFAULT = 100;
export const RECONCILE_SWEEP_LIMIT_APPLE_DEFAULT = 500;

const PROVIDER_KINDS = [
  "google",
  "microsoft",
  "apple",
] as const satisfies readonly ProviderKind[];

function perProviderIntFromEnv(
  prefix: string,
): Partial<Record<ProviderKind, number>> {
  const out: Partial<Record<ProviderKind, number>> = {};
  for (const kind of PROVIDER_KINDS) {
    const raw = process.env[`${prefix}_${kind.toUpperCase()}`];
    if (raw === undefined || raw.trim() === "") continue;
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) {
      out[kind] = parsed;
    }
  }
  return out;
}

export const SyncExecutionModeSchema = z.enum(["passive", "active"]);
export type SyncExecutionMode = z.infer<typeof SyncExecutionModeSchema>;

// Coerce yaml numbers-or-strings to a bounded positive integer.
const PositiveIntFromInput = z.coerce.number().int().positive();

// Accept a yaml boolean or the strings "true"/"false" (env vars are strings).
const BooleanFromInput = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true");

export const SyncConfigSchema = z
  .strictObject({
    NODE_ENV: z.enum(NodeEnv),
    VERSION: z.string().trim().min(1).optional(),
    PORT: PositiveIntFromInput.default(SYNC_PORT_DEFAULT),
    // Isolated `compass_sync` database URI — never the backend's mongo.uri.
    MONGO_URI: z.string().trim().min(1),
    // Shared secret authenticating trusted Compass API -> Sync requests.
    INTERNAL_AUTH_TOKEN: z.string().trim().min(1),
    // Public base URL provider OAuth redirects and webhooks resolve against
    // (e.g. https://staging.compasscalendar.com). Must be a valid URL.
    CALLBACK_BASE_URL: z.url(),
    // Where the OAuth callback redirects the browser after connecting. Optional;
    // the callback falls back to CALLBACK_BASE_URL when it is unset.
    POST_CONNECT_REDIRECT_URL: z.url().optional(),
    EXECUTION: SyncExecutionModeSchema.default("passive"),
    MAX_CONCURRENCY: PositiveIntFromInput.default(SYNC_MAX_CONCURRENCY_DEFAULT),
    // How many of MAX_CONCURRENCY's drains never claim initialImport/repair —
    // reserved for webhook/reconcile pulls, so a wave of long-running imports
    // (e.g. launch-day signups) can never head-of-line block them behind a
    // single sequential drain loop (2026-07-29 incident). Must stay below
    // MAX_CONCURRENCY, checked below, or every drain would be reserved and
    // imports would never run at all.
    RESERVED_PULL_LANES: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(SYNC_RESERVED_PULL_LANES_DEFAULT),
    // On when a scoped `compass_sync` database user exists (managed cloud), so
    // startup verifies it cannot read the API database. Off for a single-database
    // self-host with no scoped user. Defaults off — enable it deliberately.
    ENFORCE_LEAST_PRIVILEGE: BooleanFromInput.default(false),
    // The Compass API's database — the one Sync's least-privilege user must NOT
    // be able to read. Only consulted when ENFORCE_LEAST_PRIVILEGE is on.
    COMPASS_API_DATABASE: z.string().trim().min(1).default("prod_calendar"),
    // Google OAuth client, shared with the Compass API's `google` config section.
    // Optional: a passive deployment without provider credentials still starts;
    // the Google adapter refuses to construct when either is absent.
    GOOGLE_CLIENT_ID: z.string().trim().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().trim().min(1).optional(),
    // Microsoft OAuth client. Both must be set for ProviderRegistry registration.
    MICROSOFT_CLIENT_ID: z.string().trim().min(1).optional(),
    MICROSOFT_CLIENT_SECRET: z.string().trim().min(1).optional(),
    // AES-256-GCM key for password credentials at rest (Apple). Both custody
    // encryption and ProviderRegistry Apple registration require this key.
    CREDENTIAL_ENCRYPTION_KEY: z.string().trim().min(1).optional(),
    // Optional PostHog credentials for sanitized sync_health_snapshot events.
    // When absent, the health emitter no-ops (local/dev without analytics).
    POSTHOG_KEY: z.string().trim().min(1).optional(),
    POSTHOG_HOST: z.url().optional(),
    RECONCILE_STALE_AFTER_MS: PositiveIntFromInput.default(
      RECONCILE_STALE_AFTER_MS_DEFAULT,
    ),
    reconcileStaleAfterMsByKind: z
      .partialRecord(z.enum(PROVIDER_KINDS), PositiveIntFromInput)
      .default({}),
    reconcileSweepIntervalMsByKind: z
      .partialRecord(z.enum(PROVIDER_KINDS), PositiveIntFromInput)
      .default({}),
    reconcileSweepLimitByKind: z
      .partialRecord(z.enum(PROVIDER_KINDS), PositiveIntFromInput)
      .default({}),
  })
  .refine((cfg) => cfg.RESERVED_PULL_LANES < cfg.MAX_CONCURRENCY, {
    message: "sync.reservedPullLanes must be less than sync.maxConcurrency",
    path: ["RESERVED_PULL_LANES"],
  });
export type SyncConfig = z.infer<typeof SyncConfigSchema>;

export function parseSyncConfig(config: CompassConfig): SyncConfig {
  if (!config.sync) {
    throw new Error(
      "Sync service configuration is missing: add a `sync` section to compass.yaml",
    );
  }

  return SyncConfigSchema.parse({
    NODE_ENV: config.runtime.nodeEnv,
    VERSION: config.runtime.version
      ? String(config.runtime.version)
      : undefined,
    PORT: config.sync.port,
    MONGO_URI: config.sync.mongoUri,
    INTERNAL_AUTH_TOKEN: config.sync.internalAuthToken,
    CALLBACK_BASE_URL: config.sync.callbackBaseUrl,
    POST_CONNECT_REDIRECT_URL: config.sync.postConnectRedirectUrl || undefined,
    EXECUTION: config.sync.execution,
    MAX_CONCURRENCY: config.sync.maxConcurrency,
    RESERVED_PULL_LANES: config.sync.reservedPullLanes,
    ENFORCE_LEAST_PRIVILEGE: config.sync.enforceLeastPrivilege,
    COMPASS_API_DATABASE: config.sync.compassApiDatabase,
    // Empty-string (unfilled deploy placeholder) or null coerces to absent.
    GOOGLE_CLIENT_ID: config.google?.clientId || undefined,
    GOOGLE_CLIENT_SECRET: config.google?.clientSecret || undefined,
    MICROSOFT_CLIENT_ID: config.microsoft?.clientId || undefined,
    MICROSOFT_CLIENT_SECRET: config.microsoft?.clientSecret || undefined,
    CREDENTIAL_ENCRYPTION_KEY: config.sync.credentialEncryptionKey || undefined,
    POSTHOG_KEY: config.posthog?.key || undefined,
    POSTHOG_HOST: config.posthog?.host || undefined,
    reconcileStaleAfterMsByKind: {
      apple: RECONCILE_STALE_AFTER_MS_APPLE_DEFAULT,
      ...perProviderIntFromEnv("RECONCILE_STALE_AFTER_MS"),
    },
    reconcileSweepIntervalMsByKind: {
      apple: RECONCILE_SWEEP_INTERVAL_MS_APPLE_DEFAULT,
      ...perProviderIntFromEnv("RECONCILE_SWEEP_INTERVAL_MS"),
    },
    reconcileSweepLimitByKind: {
      apple: RECONCILE_SWEEP_LIMIT_APPLE_DEFAULT,
      ...perProviderIntFromEnv("RECONCILE_SWEEP_LIMIT"),
    },
  });
}

export function reconcileStaleAfterMsFor(
  config: SyncConfig,
  kind: ProviderKind,
): number {
  return (
    config.reconcileStaleAfterMsByKind[kind] ??
    (kind === "apple" ? RECONCILE_STALE_AFTER_MS_APPLE_DEFAULT : undefined) ??
    config.RECONCILE_STALE_AFTER_MS
  );
}

export function reconcileSweepIntervalMsFor(
  config: SyncConfig,
  kind: ProviderKind,
): number {
  return (
    config.reconcileSweepIntervalMsByKind[kind] ??
    (kind === "apple"
      ? RECONCILE_SWEEP_INTERVAL_MS_APPLE_DEFAULT
      : undefined) ??
    RECONCILE_SWEEP_INTERVAL_MS_DEFAULT
  );
}

export function reconcileSweepLimitFor(
  config: SyncConfig,
  kind: ProviderKind,
): number {
  return (
    config.reconcileSweepLimitByKind[kind] ??
    (kind === "apple" ? RECONCILE_SWEEP_LIMIT_APPLE_DEFAULT : undefined) ??
    RECONCILE_SWEEP_LIMIT_DEFAULT
  );
}

export function loadSyncConfig(): SyncConfig {
  return parseSyncConfig(loadCompassConfig());
}
