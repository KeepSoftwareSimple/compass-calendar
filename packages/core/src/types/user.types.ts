import type SupertokensUserMetadata from "supertokens-node/recipe/usermetadata";
import { type ProviderKind } from "./sync/identity.contracts";
import { type WithId } from "./type.utils";

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
}

/**
 * Total subscription union. Adding a member without updating
 * `WRITE_ACCESS_BY_STATUS` is a compile error.
 *
 * - `none` — legacy row, pre-backfill. Hosted derivation maps this to
 *   `awaiting_checkout` (read-only). Self-host never consults this map.
 * - `awaiting_checkout` — account exists, no Stripe subscription. read-only.
 * - `trialing` — Stripe Checkout trial in progress. writable. Local
 *   `trialing` rows without a Stripe subscription id also derive as
 *   `awaiting_checkout`.
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

/**
 * Unified connection state computed by the server.
 * Clients read this value directly instead of deriving state from multiple sources.
 * The Google-named alias stays until WP-08b reads `connections[]` per provider.
 */
export type GoogleConnectionState =
  | "NOT_CONNECTED"
  | "RECONNECT_REQUIRED"
  | "IMPORTING"
  | "HEALTHY"
  | "ATTENTION";

// Sync-backed connection summary for the browser (S41). Present only when
// connection routing is delegated to Sync. IDs/timestamps/state only — never
// credentials or event content. Plain strings so the payload stays a
// SuperTokens JSONObject (no Zod brands on the metadata wire).
// A type alias, not an interface: only aliases get the implicit index
// signature that lets these values sit inside SuperTokens' JSONObject
// metadata payload without a cast at every call site.
export type SyncConnectionSummary = {
  id: string;
  provider?: "google" | "microsoft" | "apple";
  state: string;
  stateReason: string | null;
  lastSyncedAt: string | null;
  lastHealthyAt: string | null;
  accountEmail: string | null;
  // This one connection's own product state, translated server-side from its
  // sync state/reason. The browser renders per-account status and reconnect
  // from it directly, so sync's state vocabulary stays on the server.
  connectionState: GoogleConnectionState;
  // True when this connection granted a contacts scope (sync's
  // `suggestContacts` capability), so the attendee field can offer live
  // contact suggestions. False is an ordinary state — contacts are an
  // OPTIONAL grant — and gates the "enable contact suggestions" nudge,
  // never an error surface.
  canSuggestContacts: boolean;
};
export type GoogleSyncConnectionSummary = SyncConnectionSummary;

// Intersection (not extends): SuperTokens JSONObject's string index signature
// rejects a nested `google.connection` object on an interface extends clause,
// even though every field is JSON-safe.
export type UserMetadata = SupertokensUserMetadata.JSONObject & {
  sync?: {
    importGCal?: string | null;
  };
  // Every connected provider account. WP-08b reads this; until then the
  // overlap `google.connections` copy stays so the existing web keeps working.
  connections?: SyncConnectionSummary[];
  google?: {
    connectionState?: GoogleConnectionState;
    // Every connected Google account, in connection order. The
    // precedence-winning one (for the top-level banner / unscoped hooks) is
    // derived client-side from this plus connectionState - see
    // selectPrimaryGoogleSyncConnection.
    connections?: GoogleSyncConnectionSummary[];
  };
};

export interface UserProfile
  extends Pick<
    WithId<Schema_User>,
    "firstName" | "lastName" | "name" | "email" | "locale"
  > {
  picture: string;
  userId: string;
}
