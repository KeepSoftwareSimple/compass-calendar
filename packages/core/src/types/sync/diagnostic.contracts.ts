import { z } from "zod/v4";
import { DateTimeSchema } from "@core/types/domain-primitives";
import {
  ConnectionStateReasonSchema,
  ConnectionStateSchema,
} from "@core/types/sync/connection.contracts";
import {
  ConnectionIdSchema,
  PrincipalIdSchema,
  ProviderKindSchema,
  TenantIdSchema,
} from "@core/types/sync/identity.contracts";

// HTTP responses (and nested objects they contain) use z.object so a rolling
// deploy cannot 502 on a field the other side has not seen yet. Request
// bodies, command payloads, and upserts stay z.strictObject.

// Private support lookup for a non-user-facing diagnostic connection key
// (R-OPS-05 / S45). Metadata and counts only — never tokens or event content.
export const DiagnosticConnectionResponseSchema = z.object({
  diagnosticKey: z
    .string()
    .length(32)
    .regex(/^[0-9a-f]+$/),
  connectionId: ConnectionIdSchema,
  tenantId: TenantIdSchema,
  principalId: PrincipalIdSchema,
  provider: ProviderKindSchema,
  state: ConnectionStateSchema,
  stateReason: ConnectionStateReasonSchema.nullable(),
  // Account email helps authorized support confirm the right connection; it is
  // never emitted on the public health snapshot / PostHog aggregates.
  accountEmail: z.string().nullable(),
  lastSyncedAt: DateTimeSchema.nullable(),
  lastHealthyAt: DateTimeSchema.nullable(),
  disconnectedAt: DateTimeSchema.nullable(),
  calendarCount: z.number().int().nonnegative(),
  // pending + claimed only — active work still eligible to run.
  pendingJobCount: z.number().int().nonnegative(),
  // All failed jobs for the connection (including permanent and exhausted).
  failedJobCount: z.number().int().nonnegative(),
  // Failed jobs that exhausted the self-heal requeue budget and need an
  // operator (`bun run cli manage-failed-jobs …`).
  exhaustedJobCount: z.number().int().nonnegative(),
  pendingCommandCount: z.number().int().nonnegative(),
});
export type DiagnosticConnectionResponse = z.infer<
  typeof DiagnosticConnectionResponseSchema
>;
