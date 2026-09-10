import { z } from "zod/v4";
import { ObjectIdStringSchema } from "@core/types/type.utils";

export const TenantIdSchema = ObjectIdStringSchema;
export type TenantId = z.infer<typeof TenantIdSchema>;

export const PrincipalIdSchema = ObjectIdStringSchema;
export type PrincipalId = z.infer<typeof PrincipalIdSchema>;

export const ConnectionIdSchema = ObjectIdStringSchema;
export type ConnectionId = z.infer<typeof ConnectionIdSchema>;

export const ProviderCalendarIdSchema = ObjectIdStringSchema;
export type ProviderCalendarId = z.infer<typeof ProviderCalendarIdSchema>;

export const SyncCommandIdSchema = ObjectIdStringSchema;
export type SyncCommandId = z.infer<typeof SyncCommandIdSchema>;

export const SyncJobIdSchema = ObjectIdStringSchema;
export type SyncJobId = z.infer<typeof SyncJobIdSchema>;

export const ProviderAccountIdSchema = z.string().trim().min(1).max(256);
export type ProviderAccountId = z.infer<typeof ProviderAccountIdSchema>;

export const ProviderCalendarSourceIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(1024);
export type ProviderCalendarSourceId = z.infer<
  typeof ProviderCalendarSourceIdSchema
>;

export const ProviderEventIdSchema = z.string().trim().min(1).max(1024);
export type ProviderEventId = z.infer<typeof ProviderEventIdSchema>;

export const IdempotencyKeySchema = z.string().trim().min(1).max(256);
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;

export type { EventId } from "@core/types/domain-primitives";
export { EventIdSchema } from "@core/types/domain-primitives";
export type {
  ProviderCapability,
  ProviderCapabilitySet,
  ProviderKind,
  SuperTokensThirdPartyId,
} from "../../../types/sync/identity.contracts";
export {
  PROVIDER_DISPLAY_NAMES,
  ProviderCapabilitySchema,
  ProviderCapabilitySetSchema,
  ProviderKindSchema,
  providerDisplayName,
  providerKindFromThirdPartyId,
  SUPERTOKENS_THIRD_PARTY_TO_KIND,
} from "../../../types/sync/identity.contracts";
