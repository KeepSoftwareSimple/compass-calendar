import { z } from "zod/v4";
import {
  ConnectionStateReasonSchema,
  ConnectionStateSchema,
  ProviderAccountFactsSchema,
} from "@core/types/sync/connection.contracts";
import {
  ConnectionIdSchema,
  PrincipalIdSchema,
  ProviderCapabilitySetSchema,
  ProviderKindSchema,
  TenantIdSchema,
} from "@core/types/sync/identity.contracts";

// A connection may only carry an actionRequired state with a reason attached
// (mirrors the wire contract's derivation invariant). Shared by the record and
// upsert schemas so the two cannot drift.
const hasReasonWhenActionRequired = (connection: {
  state: string;
  stateReason: string | null;
}) => connection.state !== "actionRequired" || connection.stateReason !== null;

const actionRequiredReasonIssue = {
  message: "actionRequired state requires a stateReason",
  path: ["stateReason"],
};

// Persistence record for `provider_connections`. This is the
// stored shape: string ids (Mongo accepts a string _id, and the ids are the
// same opaque 24-hex values as the wire contracts) and Date timestamps for
// indexable range queries. The API layer maps this to the ISO-string
// ProviderConnection wire contract. Credential material is added later; product
// preferences (visibility, blocking, booking target) are NOT stored here.
const ProviderConnectionRecordObjectSchema = z.strictObject({
  _id: ConnectionIdSchema,
  tenantId: TenantIdSchema,
  principalId: PrincipalIdSchema,
  provider: ProviderKindSchema,
  account: ProviderAccountFactsSchema,
  capabilities: ProviderCapabilitySetSchema,
  state: ConnectionStateSchema,
  stateReason: ConnectionStateReasonSchema.nullable(),
  // Non-user-facing key for logs / private support lookup (R-OPS-05). Derived
  // from `_id` at insert; never returned on the public connection wire.
  diagnosticKey: z
    .string()
    .length(32)
    .regex(/^[0-9a-f]+$/),
  // When the user disconnected this connection, or null while connected. This
  // is durable evidence, not a derived flag: connection-state derivation
  // treats a non-null value as the top-priority "disconnected" state, so a
  // later re-deriving worker cannot silently resurrect a disconnected account.
  disconnectedAt: z.date().nullable(),
  lastSyncedAt: z.date().nullable(),
  lastHealthyAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ProviderConnectionRecordSchema =
  ProviderConnectionRecordObjectSchema.refine(
    hasReasonWhenActionRequired,
    actionRequiredReasonIssue,
  );
export type ProviderConnectionRecord = z.infer<
  typeof ProviderConnectionRecordSchema
>;

// Reads parse through this stripped variant, not the strict schema above.
// A rolling deploy runs the old build and the new build together: the new
// build stamps a field the old build has never heard of, the old build then
// reads that row, and a strictObject rejects the unknown key
// (`unrecognized_keys`) and throws. Unknown keys are dropped from the
// in-memory record and left untouched in Mongo. Writes stay strict.
export const ProviderConnectionReadSchema =
  ProviderConnectionRecordObjectSchema.strip().refine(
    hasReasonWhenActionRequired,
    actionRequiredReasonIssue,
  );

// The fields a caller provides to create-or-update a connection by its stable
// provider-account identity. Sync owns _id, createdAt, and updatedAt. It shares
// the record's actionRequired->stateReason invariant so an invalid state can be
// rejected BEFORE the write lands — otherwise the write succeeds but every
// later read of that row fails to parse, bricking it.
export const ProviderConnectionUpsertSchema = z
  .strictObject({
    tenantId: TenantIdSchema,
    principalId: PrincipalIdSchema,
    provider: ProviderKindSchema,
    account: ProviderAccountFactsSchema,
    capabilities: ProviderCapabilitySetSchema,
    state: ConnectionStateSchema,
    stateReason: ConnectionStateReasonSchema.nullable(),
  })
  .refine(hasReasonWhenActionRequired, actionRequiredReasonIssue);
export type ProviderConnectionUpsert = z.infer<
  typeof ProviderConnectionUpsertSchema
>;
