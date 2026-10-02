import { z } from "zod/v4";
import { BillingSubscriptionStatusSchema } from "@core/types/billing.types";
import { ProviderKindSchema } from "@core/types/sync/identity.contracts";

/** Wire shape for GET /api/user/profile. */
export const UserProfileSchema = z.object({
  userId: z.string().min(1),
  firstName: z.string(),
  lastName: z.string(),
  name: z.string(),
  email: z.string(),
  locale: z.string(),
  picture: z.string(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const GoogleConnectionStateSchema = z.enum([
  "NOT_CONNECTED",
  "RECONNECT_REQUIRED",
  "IMPORTING",
  "HEALTHY",
  "ATTENTION",
]);
export type GoogleConnectionState = z.infer<typeof GoogleConnectionStateSchema>;

export const SyncConnectionSummarySchema = z.object({
  id: z.string().min(1),
  provider: ProviderKindSchema.optional(),
  state: z.string(),
  stateReason: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  lastHealthyAt: z.string().nullable(),
  accountEmail: z.string().nullable(),
  connectionState: GoogleConnectionStateSchema,
  canSuggestContacts: z.boolean(),
});
export type SyncConnectionSummary = z.infer<typeof SyncConnectionSummarySchema>;

/** Wire shape for GET/POST /api/user/metadata fields the native client reads. */
export const UserMetadataSchema = z.object({
  sync: z
    .object({
      importGCal: z.string().nullable().optional(),
    })
    .optional(),
  connections: z.array(SyncConnectionSummarySchema).optional(),
});
export type UserMetadata = z.infer<typeof UserMetadataSchema>;

export const Schema_UserBillingSchema = z.object({
  subscriptionStatus: BillingSubscriptionStatusSchema,
  trialStartedAt: z.coerce.date().optional(),
  trialEndsAt: z.coerce.date().optional(),
  stripeCustomerId: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
  stripePriceId: z.string().optional(),
  currentPeriodEnd: z.coerce.date().optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
  lastStripeEventAt: z.coerce.date().optional(),
  backfilledAt: z.coerce.date().optional(),
});
