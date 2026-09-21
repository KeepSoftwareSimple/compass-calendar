import { z } from "zod/v4";
import { DateTimeSchema } from "@core/types/domain-primitives";
import {
  ConnectionIdSchema,
  PrincipalIdSchema,
  ProviderAccountIdSchema,
  ProviderCalendarIdSchema,
  ProviderCalendarSourceIdSchema,
  ProviderCapabilitySetSchema,
  ProviderKindSchema,
  TenantIdSchema,
} from "@core/types/sync/identity.contracts";

// HTTP responses (and nested objects they contain) use z.object so a rolling
// deploy cannot 502 on a field the other side has not seen yet. Request
// bodies, command payloads, and upserts stay z.strictObject.

// Connection and calendar contracts for Compass Sync.
// Provider facts only — no credentials, and no product preferences
// (visibility, blocking, booking target) which belong to the Compass product
// layer.

// The one user-facing connection state. Only the shared health
// derivation may produce these values; no code path reports healthy because a
// single operation succeeded.
export const ConnectionStateSchema = z.enum([
  "connecting",
  "importing",
  "catchingUp",
  "healthy",
  "delayed",
  "actionRequired",
  "disconnected",
]);
export type ConnectionState = z.infer<typeof ConnectionStateSchema>;

// Sanitized reason exposed alongside delayed/actionRequired states.
export const ConnectionStateReasonSchema = z.enum([
  "authorizationRevoked",
  "authorizationExpired",
  "insufficientScopes",
  "consentRequired",
  "workOverdue",
  "providerErrors",
]);
export type ConnectionStateReason = z.infer<typeof ConnectionStateReasonSchema>;

// Display facts about the authorized provider account. The stable
// providerAccountId is the only ownership proof; email is display data and
// may change without changing identity.
export const ProviderAccountFactsSchema = z.object({
  providerAccountId: ProviderAccountIdSchema,
  email: z.string().trim().min(1).max(320).nullable(),
  displayName: z.string().trim().min(1).max(256).nullable(),
});
export type ProviderAccountFacts = z.infer<typeof ProviderAccountFactsSchema>;

// Optional feature groups a connect/reconnect consent flow may additionally
// request. Each feature maps to provider scopes the user can decline without
// affecting the connection's calendar capabilities — "contacts" asks for the
// Google contacts scopes that back attendee suggestions. Never a required
// scope: leaving one unchecked is a normal outcome, not an error.
export const ConnectionFeatureSchema = z.enum(["contacts"]);
export type ConnectionFeature = z.infer<typeof ConnectionFeatureSchema>;

export const ConnectionBeginFeaturesSchema = z
  .array(ConnectionFeatureSchema)
  .max(8)
  .readonly();
export type ConnectionBeginFeatures = z.infer<
  typeof ConnectionBeginFeaturesSchema
>;

// Opaque authenticated-encryption envelope for credentials sent between the
// Compass API and Sync services. The browser never sees this transport type.
export const EncryptedCredentialEnvelopeSchema = z.strictObject({
  iv: z.string().base64().min(1).max(128),
  ciphertext: z.string().base64().min(1).max(8192),
  authTag: z.string().base64().min(1).max(128),
});
export type EncryptedCredentialEnvelope = z.infer<
  typeof EncryptedCredentialEnvelopeSchema
>;

// Trusted Compass API → Sync handoff after a sign-in flow has exchanged an
// authorization code. This is intentionally an internal contract: the
// browser never receives or submits the credential. Optional `provider`
// defaults to google so the existing Google adoption path stays byte-identical.
export const ProviderConnectionAdoptionRequestSchema = z.strictObject({
  provider: ProviderKindSchema.optional(),
  account: ProviderAccountFactsSchema,
  credential: EncryptedCredentialEnvelopeSchema,
  grantedScopes: z
    .array(z.string().trim().min(1).max(512))
    .min(1)
    .max(64)
    .readonly(),
});
export type ProviderConnectionAdoptionRequest = z.infer<
  typeof ProviderConnectionAdoptionRequestSchema
>;
export const GoogleConnectionAdoptionRequestSchema =
  ProviderConnectionAdoptionRequestSchema;
export type GoogleConnectionAdoptionRequest = ProviderConnectionAdoptionRequest;

export const ProviderConnectionAdoptionResponseSchema = z.object({});
export type ProviderConnectionAdoptionResponse = z.infer<
  typeof ProviderConnectionAdoptionResponseSchema
>;
export const GoogleConnectionAdoptionResponseSchema =
  ProviderConnectionAdoptionResponseSchema;
export type GoogleConnectionAdoptionResponse =
  ProviderConnectionAdoptionResponse;

const STATES_WITH_REASON: ReadonlySet<ConnectionState> = new Set([
  "delayed",
  "actionRequired",
]);

export const ProviderConnectionSchema = z
  .object({
    id: ConnectionIdSchema,
    tenantId: TenantIdSchema,
    principalId: PrincipalIdSchema,
    provider: ProviderKindSchema,
    account: ProviderAccountFactsSchema,
    capabilities: ProviderCapabilitySetSchema,
    state: ConnectionStateSchema,
    // Present exactly when the state needs a user-facing explanation.
    stateReason: ConnectionStateReasonSchema.nullable(),
    // Evidence timestamps: data sync vs verified health are
    // distinct facts. Null until the first successful pass.
    lastSyncedAt: DateTimeSchema.nullable(),
    lastHealthyAt: DateTimeSchema.nullable(),
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
  })
  .refine(
    (connection) =>
      connection.state !== "actionRequired" || connection.stateReason !== null,
    {
      message: "actionRequired state requires a stateReason",
      path: ["stateReason"],
    },
  )
  .refine(
    (connection) =>
      !connection.stateReason || STATES_WITH_REASON.has(connection.state),
    {
      message: "stateReason is only allowed for delayed or actionRequired",
      path: ["stateReason"],
    },
  );
export type ProviderConnection = z.infer<typeof ProviderConnectionSchema>;

// Provider-neutral access role for a calendar. Normalized capabilities are
// the operational truth; the role is a display/diagnostic fact.
export const CalendarAccessRoleSchema = z.enum([
  "owner",
  "editor",
  "viewer",
  "busyOnly",
]);
export type CalendarAccessRole = z.infer<typeof CalendarAccessRoleSchema>;

export const SyncCalendarCapabilitiesSchema = z.object({
  canReadEvents: z.boolean(),
  canWriteEvents: z.boolean(),
  canReadBusy: z.boolean(),
  canInviteAttendees: z.boolean(),
});
export type SyncCalendarCapabilities = z.infer<
  typeof SyncCalendarCapabilitiesSchema
>;

export const ProviderCalendarSchema = z.object({
  id: ProviderCalendarIdSchema,
  tenantId: TenantIdSchema,
  principalId: PrincipalIdSchema,
  connectionId: ConnectionIdSchema,
  providerCalendarId: ProviderCalendarSourceIdSchema,
  displayName: z.string().trim().min(1).max(1024),
  color: z.string().trim().min(1).max(64).nullable(),
  // Provider facts: active reflects the provider/calendar-list
  // state, primary the provider's default-calendar designation.
  active: z.boolean(),
  primary: z.boolean(),
  accessRole: CalendarAccessRoleSchema,
  capabilities: SyncCalendarCapabilitiesSchema,
  createsGoogleMeet: z.boolean().default(true),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});
export type ProviderCalendar = z.infer<typeof ProviderCalendarSchema>;

export const ConnectionListResponseSchema = z.object({
  connections: z.array(ProviderConnectionSchema).readonly(),
});
export type ConnectionListResponse = z.infer<
  typeof ConnectionListResponseSchema
>;

// Start an OAuth authorization flow for the caller's principal. An optional
// connectionId means reconnect (rebind consent to that existing connection);
// omit it for a fresh connection. Optional `features` widen the consent
// request with that feature's OPTIONAL scopes (e.g. "contacts" for attendee
// suggestions); absent keeps the request — and the consent URL sync mints —
// byte-identical to before features existed. Principal scope always comes
// from the authenticated context, never the body.
export const ConnectionBeginRequestSchema = z.strictObject({
  connectionId: ConnectionIdSchema.optional(),
  features: ConnectionBeginFeaturesSchema.optional(),
  // Defaults to google at the route when omitted so existing callers stay
  // byte-identical. Other kinds are accepted here and resolved against the
  // provider registry.
  provider: ProviderKindSchema.optional(),
});
export type ConnectionBeginRequest = z.infer<
  typeof ConnectionBeginRequestSchema
>;

// Browser begin response: a redirect (OAuth) or an already-connected result
// (password credential flows, defined here; the route that produces
// `connected` lands in Apple WP-03). The legacy `{ authorizationUrl }` body
// is still accepted so a backend/web build that lands before the wrap still
// parses, and so the sync-internal begin reply stays byte-identical.
export const ConnectionBeginRedirectResponseSchema = z.object({
  kind: z.literal("redirect"),
  authorizationUrl: z.string().url(),
});
export type ConnectionBeginRedirectResponse = z.infer<
  typeof ConnectionBeginRedirectResponseSchema
>;

export const ConnectionBeginConnectedResponseSchema = z.object({
  kind: z.literal("connected"),
  connectionId: ConnectionIdSchema,
});
export type ConnectionBeginConnectedResponse = z.infer<
  typeof ConnectionBeginConnectedResponseSchema
>;

// Plaintext payload the browser submits before the Compass API seals it for
// the Sync hop. Never sent on the wire outside the encrypted envelope.
export const CredentialConnectPayloadSchema = z.strictObject({
  username: z.string().trim().email().max(320),
  secret: z.string().min(1).max(256),
});
export type CredentialConnectPayload = z.infer<
  typeof CredentialConnectPayloadSchema
>;

// Browser-submitted credential connect body over HTTPS. The Compass API
// seals this into an envelope before forwarding to Sync.
export const ConnectionCredentialBrowserRequestSchema = z.strictObject({
  provider: z.literal("apple"),
  username: CredentialConnectPayloadSchema.shape.username,
  secret: CredentialConnectPayloadSchema.shape.secret,
});
export type ConnectionCredentialBrowserRequest = z.infer<
  typeof ConnectionCredentialBrowserRequestSchema
>;

// Session-authed Compass API and Sync-internal credential connect body. The
// principal always comes from the signed session / internal auth, never the
// body.
export const ConnectionCredentialRequestSchema = z.strictObject({
  provider: z.literal("apple"),
  envelope: EncryptedCredentialEnvelopeSchema,
});
export type ConnectionCredentialRequest = z.infer<
  typeof ConnectionCredentialRequestSchema
>;

export const ConnectionCredentialSubmitRequestSchema = z.union([
  ConnectionCredentialBrowserRequestSchema,
  ConnectionCredentialRequestSchema,
]);
export type ConnectionCredentialSubmitRequest = z.infer<
  typeof ConnectionCredentialSubmitRequestSchema
>;

export const ConnectionCredentialResponseSchema = z.object({
  connectionId: ConnectionIdSchema,
});
export type ConnectionCredentialResponse = z.infer<
  typeof ConnectionCredentialResponseSchema
>;

export const ConnectionBeginLegacyRedirectResponseSchema = z.object({
  authorizationUrl: z.string().url(),
});

export const ConnectionBeginResponseSchema = z.union([
  ConnectionBeginRedirectResponseSchema,
  ConnectionBeginConnectedResponseSchema,
  ConnectionBeginLegacyRedirectResponseSchema,
]);
export type ConnectionBeginResponse = z.infer<
  typeof ConnectionBeginResponseSchema
>;

export function toConnectionBeginRedirect(
  response: ConnectionBeginResponse,
): ConnectionBeginRedirectResponse {
  if ("authorizationUrl" in response) {
    return {
      kind: "redirect",
      authorizationUrl: response.authorizationUrl,
    };
  }
  throw new Error("Connection begin did not return a redirect");
}

// User-triggered catch-up: enqueue (or boost) an incremental pull for each
// events resource owned by the signed principal.
// - `enqueued`: jobs that will actually run (created + boosted + revived failed)
// - `inFlight`: already claimed; Refresh left the lease alone
// - `resources`: events resources considered (may exceed enqueued+inFlight when
//   a coalesced key races between the three writes — outcome is then mislabeled,
//   never corrupted)
export const ConnectionRefreshResponseSchema = z.object({
  enqueued: z.number().int().nonnegative(),
  // Defaults so a web/backend build that lands before sync still accepts the
  // old `{ enqueued }` body instead of failing Refresh closed.
  inFlight: z.number().int().nonnegative().default(0),
  resources: z.number().int().nonnegative().default(0),
});
export type ConnectionRefreshResponse = z.infer<
  typeof ConnectionRefreshResponseSchema
>;

// Content-free batch used by the backend's one foreground freshness loop.
// Personal Compass tenants use the same ObjectId for tenant + principal, so
// Sync can safely derive both after the service-authenticated request.
export const ForegroundRefreshRequestSchema = z.strictObject({
  principalIds: z.array(PrincipalIdSchema).min(1).max(500),
});
export type ForegroundRefreshRequest = z.infer<
  typeof ForegroundRefreshRequestSchema
>;

export const CalendarListQuerySchema = z.strictObject({
  // Optional narrowing; principal scope always comes from authenticated
  // context, never from the request body.
  connectionId: ConnectionIdSchema.optional(),
  activeOnly: z.boolean().optional(),
});
export type CalendarListQuery = z.infer<typeof CalendarListQuerySchema>;

export const SyncCalendarListResponseSchema = z.object({
  calendars: z.array(ProviderCalendarSchema).readonly(),
});
export type SyncCalendarListResponse = z.infer<
  typeof SyncCalendarListResponseSchema
>;
