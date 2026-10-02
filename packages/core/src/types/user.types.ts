import type SupertokensUserMetadata from "supertokens-node/recipe/usermetadata";
import { type z } from "zod/v4";
import {
  type GoogleConnectionState,
  GoogleConnectionStateSchema,
  type SyncConnectionSummary,
  SyncConnectionSummarySchema,
  UserMetadataSchema,
  type UserProfile,
  UserProfileSchema,
} from "@core/types/user.profile.contracts";
import { type ProviderKind } from "./sync/identity.contracts";

export {
  type GoogleConnectionState,
  GoogleConnectionStateSchema,
  type SyncConnectionSummary,
  SyncConnectionSummarySchema,
  UserMetadataSchema,
  type UserProfile,
  UserProfileSchema,
};

/**
 * One login method on a Compass user. Identity is `(provider, subjectId)`;
 * `email` is display data and is never the lookup key by itself.
 */
export interface Schema_UserIdentity {
  provider: ProviderKind;
  subjectId: string;
  email: string;
  displayName?: string;
  picture?: string;
  linkedAt: Date;
}

export interface Schema_User {
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  locale: string;
  /**
   * Login methods linked to this Compass user. `google.googleId` stays
   * populated for one release while rows are dual-written and backfilled.
   */
  identities?: Schema_UserIdentity[];
  google?: {
    googleId: string;
    picture: string;
    // Legacy pre-Sync credential slot. Sync's credential store is the only
    // authority now: nothing writes this anymore, and account deletion
    // revokes via Sync's principal purge. Optional because rows written
    // before the cutover still carry it.
    gRefreshToken?: string;
  };
  signedUpAt?: Date;
  lastLoggedInAt?: Date;
  /** Last time this user's client connected to the SSE stream -- touched on
   *  every (re)connect, distinct from `lastLoggedInAt`'s sign-in moment.
   *  Used to tell an active user apart from an abandoned account (A40). */
  lastSeenAt?: Date;
  /**
   * Trial/subscription state. Optional and absent for every user who
   * existed before this field shipped -- treat absence as "none" (never
   * started a trial), matching the established incremental-field pattern
   * for this schema.
   */
  billing?: Schema_UserBilling;
  /**
   * Welcome-sequence email preferences. Optional and absent for users who
   * existed before this field shipped. Either timestamp stops the dispatch
   * loop from sending further queued rows.
   */
  emailPreferences?: {
    /** The recipient clicked the unsubscribe link. */
    unsubscribedAt?: Date;
    /** The provider reported a hard bounce or complaint. */
    suppressedAt?: Date;
  };
}

/**
 * Total subscription union. Adding a member without updating
 * `WRITE_ACCESS_BY_STATUS` is a compile error.
 *
 * - `none` — legacy row, pre-backfill. Hosted derivation maps this to
 *   `awaiting_checkout` (read-only). Self-host never consults this map.
 * - `awaiting_checkout` — account exists, no Stripe subscription. read-only.
 * - `trialing` — Stripe Checkout trial in progress. writable.
 * - `active` — paid. writable.
 * - `past_due` — dunning window. writable + banner.
 * - `canceled` — subscription canceled. read-only.
 * - `expired` — trial or unpaid ended. read-only.
 */
export type BillingSubscriptionStatus =
  | "none"
  | "awaiting_checkout"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

export interface Schema_UserBilling {
  subscriptionStatus: BillingSubscriptionStatus;
  trialStartedAt?: Date;
  trialEndsAt?: Date;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  lastStripeEventAt?: Date;
  backfilledAt?: Date;
}

// Intersection (not extends): SuperTokens JSONObject's string index signature
// rejects a nested `google.connection` object on an interface extends clause,
// even though every field is JSON-safe.
export type UserMetadata = SupertokensUserMetadata.JSONObject &
  z.infer<typeof UserMetadataSchema>;
