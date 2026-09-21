import { z } from "zod/v4";
import {
  ConnectionIdSchema,
  PrincipalIdSchema,
  SyncCommandIdSchema,
  SyncJobIdSchema,
  TenantIdSchema,
} from "@core/types/sync/identity.contracts";

export const JobKindSchema = z.enum([
  "calendarListSync",
  "initialImport",
  "bootstrapCatchup",
  "incrementalPull",
  "subscriptionMaintain",
  "repair",
]);
export type JobKind = z.infer<typeof JobKindSchema>;

// pending: waiting to be claimed. claimed: leased by a worker. failed: a
// terminal failure needing attention (retryable failures return to pending).
export const JobStateSchema = z.enum(["pending", "claimed", "failed"]);
export type JobState = z.infer<typeof JobStateSchema>;

// The only failure class any code path produces. Durable failures never
// persist a class at all — they settle as drops so the coalescing key stays
// free for a re-enqueue (see sync-job-dispatch.service.ts). Kept as a
// persisted field because existing job docs carry it.
export const JobFailureClassSchema = z.literal("retryableTransient");
export type JobFailureClass = z.infer<typeof JobFailureClassSchema>;

// Claim order is arm order in claimDueJob, not a Mongo sort on this field.
// Keep this to two rungs — each additional rung needs its own claim arm.
// See the 2026-08-07 restart-burst / Refresh starvation incident.
export const JOB_PRIORITY = {
  background: 0,
  user: 10,
} as const;
export type JobPriority = (typeof JOB_PRIORITY)[keyof typeof JOB_PRIORITY];

// Persistence record for `jobs` — a small internal work item pointing at a
// connection and (optionally) a resource or command. A unique coalescing key
// collapses a storm of equivalent notifications into one job. Jobs hold no
// credentials and no event content.
export const JobRecordSchema = z.strictObject({
  _id: SyncJobIdSchema,
  tenantId: TenantIdSchema,
  principalId: PrincipalIdSchema,
  connectionId: ConnectionIdSchema,
  // What the job acts on. Both null for connection-wide work.
  resourceId: z.string().trim().min(1).nullable(),
  commandId: SyncCommandIdSchema.nullable(),
  kind: JobKindSchema,
  // Two-rung ladder only. Adding a third rung costs another claim arm in
  // claimDueJob (priority is a filter, not a sort key — see job.repository.ts).
  // Introduced after the 2026-08-07 restart burst left user Refresh clicks
  // queued behind ~440 background jobs for 15+ minutes.
  priority: z.number().int(),
  state: JobStateSchema,
  runAfter: z.date(),
  attempt: z.number().int().min(0),
  coalescingKey: z.string().trim().min(1),
  leaseOwner: z.string().trim().min(1).nullable(),
  leaseExpiresAt: z.date().nullable(),
  failureClass: JobFailureClassSchema.nullable(),
  // How many times the self-heal sweep has requeued this job after it reached
  // state:"failed". Distinct from `attempt` (which a requeue resets to give
  // the job a fresh retry ladder) so a resource that keeps failing cannot be
  // requeued forever — the sweep stops once this hits its cap.
  //
  // Defaulted, not required: this field was introduced after jobs already
  // existed in production, and a job doc predating it is still perfectly
  // valid work. Parsing one must not throw — enqueue coalesces onto whatever
  // doc already holds a key and re-parses it, so a single unparseable job
  // took down every sweep fleet-wide for 23h (2026-07-31).
  requeuedCount: z.number().int().min(0).default(0),
  // Sanitized last engine/provider error for operator logs and health. Never
  // holds tokens. Defaulted so docs predating this field still parse.
  lastError: z.string().trim().max(500).nullable().default(null),
  lastErrorAt: z.date().nullable().default(null),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type JobRecord = z.infer<typeof JobRecordSchema>;

// Reads parse through this stripped variant, not the strict schema above.
// A rolling deploy runs the old build and the new build together: the new
// build stamps a field the old build has never heard of, the old build then
// reads that row, and a strictObject rejects the unknown key
// (`unrecognized_keys`) and throws. Unknown keys are dropped from the
// in-memory record and left untouched in Mongo. Writes stay strict.
export const JobReadSchema = JobRecordSchema.strip();

export const JobEnqueueSchema = JobRecordSchema.omit({
  _id: true,
  state: true,
  attempt: true,
  leaseOwner: true,
  leaseExpiresAt: true,
  failureClass: true,
  requeuedCount: true,
  lastError: true,
  lastErrorAt: true,
  createdAt: true,
  updatedAt: true,
});
export type JobEnqueue = z.infer<typeof JobEnqueueSchema>;

// The canonical enqueue shapes. The coalescing-key conventions live here and
// nowhere else: resource-scoped work coalesces per (kind, resource), and
// calendar-list discovery coalesces per CONNECTION (resourceId: null), so a
// sweep-enqueued and a connect-enqueued discovery for one connection always
// collapse into the same job.
export function resourceJob(
  resource: Pick<JobEnqueue, "tenantId" | "principalId" | "connectionId"> & {
    _id: string;
  },
  kind: Exclude<JobKind, "calendarListSync">,
  runAfter: Date,
  priority: JobPriority = JOB_PRIORITY.background,
): JobEnqueue {
  return {
    tenantId: resource.tenantId,
    principalId: resource.principalId,
    connectionId: resource.connectionId,
    resourceId: resource._id,
    commandId: null,
    kind,
    priority,
    runAfter,
    coalescingKey: `${kind}:${resource._id}`,
  };
}

export function calendarListSyncJob(
  scope: Pick<JobEnqueue, "tenantId" | "principalId" | "connectionId">,
  runAfter: Date,
  priority: JobPriority = JOB_PRIORITY.background,
): JobEnqueue {
  return {
    tenantId: scope.tenantId,
    principalId: scope.principalId,
    connectionId: scope.connectionId,
    resourceId: null,
    commandId: null,
    kind: "calendarListSync",
    priority,
    runAfter,
    coalescingKey: `calendarListSync:${scope.connectionId}`,
  };
}
