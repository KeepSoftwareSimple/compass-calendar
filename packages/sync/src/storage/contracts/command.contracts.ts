import { z } from "zod/v4";
import { EventIdSchema } from "@core/types/domain-primitives";
import {
  SyncCommandInputSchema,
  SyncCommandOutcomeSchema,
} from "@core/types/sync/command.contracts";
import { ProviderEventVersionSchema } from "@core/types/sync/event.contracts";
import {
  IdempotencyKeySchema,
  PrincipalIdSchema,
  SyncCommandIdSchema,
  TenantIdSchema,
} from "@core/types/sync/identity.contracts";

// A create command has nothing prior to condition against, so it never carries
// an expected version.
const createHasNoExpectedVersion = (command: {
  input: { kind: string };
  expectedVersion: string | null;
}) => command.input.kind !== "create" || command.expectedVersion === null;

const createExpectedVersionIssue = {
  message: "A create command cannot carry an expectedVersion",
  path: ["expectedVersion"],
};

// Persistence record for `commands` — acknowledged, durable user intent for one
// event mutation. Unique per (tenant, principal, idempotencyKey) so a retried
// submission maps to the same command. `outcome` is nested so its `state` is
// indexable. No credentials or raw provider payloads are stored here.
const CommandRecordObjectSchema = z.strictObject({
  _id: SyncCommandIdSchema,
  tenantId: TenantIdSchema,
  principalId: PrincipalIdSchema,
  idempotencyKey: IdempotencyKeySchema,
  eventId: EventIdSchema,
  input: SyncCommandInputSchema,
  expectedVersion: ProviderEventVersionSchema.nullable(),
  outcome: SyncCommandOutcomeSchema,
  attemptCount: z.number().int().min(0),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CommandRecordSchema = CommandRecordObjectSchema.refine(
  createHasNoExpectedVersion,
  createExpectedVersionIssue,
);
export type CommandRecord = z.infer<typeof CommandRecordSchema>;

// Reads parse through this stripped variant, not the strict schema above.
// A rolling deploy runs the old build and the new build together: the new
// build stamps a field the old build has never heard of, the old build then
// reads that row, and a strictObject rejects the unknown key
// (`unrecognized_keys`) and throws. Unknown keys are dropped from the
// in-memory record and left untouched in Mongo. Writes stay strict.
export const CommandReadSchema = CommandRecordObjectSchema.strip().refine(
  createHasNoExpectedVersion,
  createExpectedVersionIssue,
);

// Fields a caller supplies to submit a command. Sync owns _id, attemptCount,
// outcome (starts pending), createdAt, and updatedAt.
export const CommandSubmitSchema = z
  .strictObject({
    tenantId: TenantIdSchema,
    principalId: PrincipalIdSchema,
    idempotencyKey: IdempotencyKeySchema,
    eventId: EventIdSchema,
    input: SyncCommandInputSchema,
    expectedVersion: ProviderEventVersionSchema.nullable(),
    // Per-submission undo/redo replay intent, not persisted on the command
    // record (submit() only ever $setOnInsert's this object) — see
    // CommandSubmitRequestSchema.restore.
    restore: z.literal(true).optional(),
  })
  .refine(createHasNoExpectedVersion, createExpectedVersionIssue);
export type CommandSubmit = z.infer<typeof CommandSubmitSchema>;
