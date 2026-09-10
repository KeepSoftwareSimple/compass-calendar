import { z } from "zod/v4";
import { POSTHOG_ERROR_TRACKING_PROPERTY } from "@core/constants/posthog-error-tracking.properties";
import { DateTimeSchema } from "@core/types/domain-primitives";
import { ProviderKindSchema } from "@core/types/sync/identity.contracts";

const syncServiceName = "compass-sync" as const;

// Sanitized, bounded-cardinality sync health snapshot (R-OPS / S44).
// Emitted as `sync_health_snapshot` every five minutes. Counts and ages only —
// never tokens, event content, tenant/principal ids, or raw provider errors.
export const SyncHealthConnectionCountsSchema = z.strictObject({
  connecting: z.number().int().nonnegative(),
  importing: z.number().int().nonnegative(),
  catchingUp: z.number().int().nonnegative(),
  healthy: z.number().int().nonnegative(),
  delayed: z.number().int().nonnegative(),
  actionRequired: z.number().int().nonnegative(),
  disconnected: z.number().int().nonnegative(),
});
export type SyncHealthConnectionCounts = z.infer<
  typeof SyncHealthConnectionCountsSchema
>;

export const SyncHealthJobBacklogSchema = z.strictObject({
  pending: z.number().int().nonnegative(),
  claimed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  // Age of the oldest due pending/claimed-expired job, or null when none due.
  oldestDueAgeMs: z.number().int().nonnegative().nullable(),
});
export type SyncHealthJobBacklog = z.infer<typeof SyncHealthJobBacklogSchema>;

export const SyncHealthSubscriptionCountsSchema = z.strictObject({
  healthy: z.number().int().nonnegative(),
  renewSoon: z.number().int().nonnegative(),
  expired: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
  // Resources holding a live subscription that have NEVER had a push
  // notification delivered. The whole fleet sat at this number for at least
  // nine days in August 2026 because the reverse proxy stopped routing
  // /sync/* to the Sync service: Google got 200 OK with the web app's HTML,
  // counted every push as delivered, and never retried. Nothing else went
  // red — the reconcile sweep quietly absorbed the load and calendars just
  // got slow. This is the number that makes that visible.
  neverNotified: z.number().int().nonnegative(),
});
export type SyncHealthSubscriptionCounts = z.infer<
  typeof SyncHealthSubscriptionCountsSchema
>;

export const SyncHealthFreshnessSchema = z.strictObject({
  sampleSize: z.number().int().nonnegative(),
  p50Ms: z.number().int().nonnegative().nullable(),
  p95Ms: z.number().int().nonnegative().nullable(),
  p99Ms: z.number().int().nonnegative().nullable(),
  // Share of sampled events resources whose last success is older than 30s.
  percentOver30s: z.number().min(0).max(100).nullable(),
});
export type SyncHealthFreshness = z.infer<typeof SyncHealthFreshnessSchema>;

export const SyncHealthSnapshotSchema = z.strictObject({
  [POSTHOG_ERROR_TRACKING_PROPERTY.environment]: z.string().min(1),
  execution: z.enum(["passive", "active"]),
  provider: ProviderKindSchema,
  [POSTHOG_ERROR_TRACKING_PROPERTY.service]: z.literal(syncServiceName),
  connections: SyncHealthConnectionCountsSchema,
  jobs: SyncHealthJobBacklogSchema,
  subscriptions: SyncHealthSubscriptionCountsSchema,
  freshness: SyncHealthFreshnessSchema,
  computedAt: DateTimeSchema,
  computeMs: z.number().int().nonnegative(),
});
export type SyncHealthSnapshot = z.infer<typeof SyncHealthSnapshotSchema>;

export const SYNC_HEALTH_SNAPSHOT_EVENT = "sync_health_snapshot" as const;

// Emitted once per reconcile-sweep cycle completion (~every 10 min), rather
// than on a fixed telemetry timer like the health snapshot above. A queue
// depth GAUGE sampled every 5 minutes cannot reliably detect a sweep that
// enqueues and fully drains work in well under a minute — an alert built on
// jobs.pending fired repeatedly on a healthy fleet because the 5-minute
// sampler almost never caught the queue non-empty (2026-08-01). Counting
// discrete sweep-completion events instead sidesteps the sampling gap
// entirely: a sweep either ran or it didn't, with nothing in between for a
// sampler to miss.
export const SyncReconcileSweepEventSchema = z.strictObject({
  environment: z.string().min(1),
  service: z.literal("compass-sync"),
  enqueued: z.number().int().nonnegative(),
});
export type SyncReconcileSweepEvent = z.infer<
  typeof SyncReconcileSweepEventSchema
>;

export const SYNC_RECONCILE_SWEEP_EVENT = "sync_reconcile_sweep" as const;

// Emitted once per job that exhausts its retries and settles into a terminal
// failure (state:"failed"). Without this, a dead-lettered job is invisible —
// it sits holding its coalescing key, so nothing re-enqueues it, and nothing
// pages anyone either. Sanitized: job kind and provider ids only, never
// tokens or provider error content.
export const SyncJobTerminalFailureEventSchema = z.strictObject({
  environment: z.string().min(1),
  service: z.literal("compass-sync"),
  jobKind: z.string().min(1),
  connectionId: z.string().min(1),
  resourceId: z.string().nullable(),
  attempt: z.number().int().nonnegative(),
});
export type SyncJobTerminalFailureEvent = z.infer<
  typeof SyncJobTerminalFailureEventSchema
>;

export const SYNC_JOB_TERMINAL_FAILURE_EVENT =
  "sync_job_terminal_failure" as const;
