import { z } from "zod/v4";
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
  isSynthetic: z.boolean().optional(),
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

/** Wire shape for GET/POST /api/user/metadata persisted account fields. */
export const UserMetadataSchema = z.object({
  sync: z
    .object({
      importGCal: z.string().nullable().optional(),
    })
    .optional(),
  onboarding: z
    .object({
      /** ISO timestamp when the user dismissed the Life view intro modal. */
      lifeViewIntroSeenAt: z.string().optional(),
    })
    .optional(),
  shortcuts: z
    .object({
      /** Hint keycap groups the user has already celebrated (first use). */
      hintFirstUsed: z.array(z.string()).optional(),
    })
    .optional(),
  connections: z.array(SyncConnectionSummarySchema).optional(),
});
export type UserMetadata = z.infer<typeof UserMetadataSchema>;
