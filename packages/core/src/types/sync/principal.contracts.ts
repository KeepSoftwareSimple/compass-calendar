import { z } from "zod/v4";

// HTTP responses (and nested objects they contain) use z.object so a rolling
// deploy cannot 502 on a field the other side has not seen yet. Request
// bodies, command payloads, and upserts stay z.strictObject.

// Response for DELETE /internal/principal — hard-delete every Sync-held row for
// the signed principal (account deletion). Counts are non-negative and the
// operation is idempotent: a second call returns zeros.
export const PrincipalPurgeResponseSchema = z.object({
  connections: z.number().int().nonnegative(),
  credentials: z.number().int().nonnegative(),
  calendars: z.number().int().nonnegative(),
  events: z.number().int().nonnegative(),
  eventOccurrences: z.number().int().nonnegative(),
  syncResources: z.number().int().nonnegative(),
  commands: z.number().int().nonnegative(),
  jobs: z.number().int().nonnegative(),
  deletionMarkers: z.number().int().nonnegative(),
  invalidations: z.number().int().nonnegative(),
});
export type PrincipalPurgeResponse = z.infer<
  typeof PrincipalPurgeResponseSchema
>;
