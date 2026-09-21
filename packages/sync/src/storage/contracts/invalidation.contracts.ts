import { z } from "zod/v4";
import { SyncInvalidationSchema } from "@core/types/sync/change-feed.contracts";
import {
  PrincipalIdSchema,
  TenantIdSchema,
} from "@core/types/sync/identity.contracts";
import { ObjectIdStringSchema } from "@core/types/type.utils";

// Persistence record for `invalidations` — the durable, content-free outbox
// behind GET /internal/changes. Rows carry IDs (and import progress) only;
// clients always refetch canonical state. A TTL index removes rows after the
// retention window; a resume cursor older than that window yields resyncRequired.
export const InvalidationRecordSchema = z.strictObject({
  _id: ObjectIdStringSchema,
  tenantId: TenantIdSchema,
  principalId: PrincipalIdSchema,
  invalidation: SyncInvalidationSchema,
  emittedAt: z.date(),
  expiresAt: z.date(),
});
export type InvalidationRecord = z.infer<typeof InvalidationRecordSchema>;

// Reads parse through this stripped variant, not the strict schema above.
// A rolling deploy runs the old build and the new build together: the new
// build stamps a field the old build has never heard of, the old build then
// reads that row, and a strictObject rejects the unknown key
// (`unrecognized_keys`) and throws. Unknown keys are dropped from the
// in-memory record and left untouched in Mongo. Writes stay strict.
export const InvalidationReadSchema = InvalidationRecordSchema.strip();

export const InvalidationAppendSchema = InvalidationRecordSchema.omit({
  _id: true,
  expiresAt: true,
});
export type InvalidationAppend = z.infer<typeof InvalidationAppendSchema>;
